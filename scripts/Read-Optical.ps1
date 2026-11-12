param([Parameter(Mandatory)][string]$ExecutablePath,[Parameter(Mandatory)][int]$ParentPid,[switch]$CompileOnly)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
public static class WCIOpticalCapture {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X,Y; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out RECT rect);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window,ref POINT point);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref uint length);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static int cachedX=-1,cachedY=-1,lastWidth,lastHeight;
    static double cachedCell;
    static IntPtr lastWindow;
    const int Columns=80, Rows=25, HeaderBytes=18, ChunkBytes=1422;
    static readonly int[,] markers={{255,0,255},{0,255,255},{255,255,0},{0,255,0}};
    static bool Match(byte[] data,int stride,int width,int height,int x,int y,int marker) {
        if(x<0||y<0||x>=width||y>=height)return false;
        int offset=y*stride+x*4;
        return Math.Abs(data[offset+2]-markers[marker,0])<=25 && Math.Abs(data[offset+1]-markers[marker,1])<=25 && Math.Abs(data[offset]-markers[marker,2])<=25;
    }
    static int Sample(int origin,int position,double cell) {
        return (int)(origin+(position+0.5)*cell-0.25);
    }
    static int Level(byte channel) {
        int level=(channel+8)/64;
        return level<=3&&Math.Abs(channel-(24+64*level))<=25?level:-1;
    }
    static int U16(byte[] bytes,int offset) {return (bytes[offset]<<8)|bytes[offset+1];}
    public static byte[] DecodePacket(byte[] data,int stride,int width,int height,int x,int y,double cell) {
        if(data==null||width<Columns||height<Rows||stride<(long)width*4||data.LongLength<(long)stride*height
            ||!(cell>=1.5&&cell<=8)||x<0||y<0||x+Columns*cell>width||y+Rows*cell>height)return null;
        for(int i=0;i<4;i++)
            if(!Match(data,stride,width,height,Sample(x,i,cell),Sample(y,0,cell),i))return null;

        byte[] bytes=new byte[HeaderBytes+ChunkBytes];
        int bits=0,acc=0,length=0,needed=HeaderBytes;
        // Sample only protocol data. The rest of the marker row and payload padding stay in this process.
        for(int row=1;row<Rows;row++)for(int col=0;col<Columns;col++) {
            int offset=Sample(y,row,cell)*stride+Sample(x,col,cell)*4;
            int r=Level(data[offset+2]),g=Level(data[offset+1]),b=Level(data[offset]);
            if(r<0||g<0||b<0)return null;
            acc=(acc<<6)|(r<<4)|(g<<2)|b;
            bits+=6;
            if(bits<8)continue;
            bits-=8;
            bytes[length++]=(byte)(acc>>bits);
            acc&=(1<<bits)-1;
            if(length==HeaderBytes) {
                if(bytes[0]!=87||bytes[1]!=67||bytes[2]!=73||bytes[3]!=49)return null; // WCI1
                int index=U16(bytes,8),count=U16(bytes,10),size=U16(bytes,12);
                if(count<1||count>256||index>=count||size<1||size>ChunkBytes
                    ||(index<count-1&&size!=ChunkBytes))return null;
                needed=HeaderBytes+size;
            }
            if(length==needed) {
                Array.Resize(ref bytes,needed);
                return bytes;
            }
        }
        return null;
    }
    static byte[] Locate(byte[] data,int stride,int width,int height,out int x,out int y,out double cell) {
        for(int row=0;row<height-25;row++)for(int col=0;col<width-80;col++) {
            if(!Match(data,stride,width,height,col,row,0))continue;
            int cursor=col;bool valid=true;
            for(int m=0;m<4;m++) {
                int start=cursor;
                while(cursor<Math.Min(width,col+40)&&Match(data,stride,width,height,cursor,row,m))cursor++;
                if(cursor-start<1||cursor-start>8){valid=false;break;}
            }
            double size=(cursor-col)/4.0;
            if(!valid)continue;
            byte[] packet=DecodePacket(data,stride,width,height,col,row,size);
            if(packet!=null){x=col;y=row;cell=size;return packet;}
        }
        x=y=0;cell=0;return null;
    }
    public static Task WatchParentPipe() {
        // No commands or payload enter through stdin. EOF also revokes capture if the parent cannot kill us.
        return Task.Factory.StartNew(() => {
            using(Stream input=Console.OpenStandardInput())while(input.ReadByte()!=-1) {}
        },TaskCreationOptions.LongRunning);
    }
    public static string Read(string allowedExecutable) {
        IntPtr oldDpi=SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
            IntPtr window=GetForegroundWindow();
            if(window==IntPtr.Zero||IsIconic(window))return null;
            uint pid;GetWindowThreadProcessId(window,out pid);
            // PROCESS_QUERY_LIMITED_INFORMATION only: executable identity, never game memory.
            IntPtr handle=OpenProcess(0x1000,false,pid);
            if(handle==IntPtr.Zero)return null;
            try {
                StringBuilder name=new StringBuilder(32768);uint length=32768;
                if(!QueryFullProcessImageName(handle,0,name,ref length)||!String.Equals(Path.GetFullPath(name.ToString()),allowedExecutable,StringComparison.OrdinalIgnoreCase))return null;
            } finally {CloseHandle(handle);}
            RECT client;POINT origin=new POINT();
            if(!GetClientRect(window,out client)||!ClientToScreen(window,ref origin))return null;
            int cw=client.Right-client.Left,ch=client.Bottom-client.Top;
            if(cw<160||ch<100)return null;
            if(window!=lastWindow||cw!=lastWidth||ch!=lastHeight){cachedX=-1;lastWindow=window;lastWidth=cw;lastHeight=ch;}
            bool cached=cachedX>=0;
            int left=cached?cachedX:Math.Max(0,cw-480),top=cached?cachedY:0;
            int width=cached?(int)Math.Ceiling(80*cachedCell):Math.Min(480,cw),height=cached?(int)Math.Ceiling(25*cachedCell):Math.Min(300,ch);
            if(left+width>cw||top+height>ch){cachedX=-1;return null;}
            using(Bitmap bitmap=new Bitmap(width,height,PixelFormat.Format32bppArgb)) {
                using(Graphics graphics=Graphics.FromImage(bitmap))graphics.CopyFromScreen(origin.X+left,origin.Y+top,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
                // Foreground changed during capture: discard the image without emitting pixels.
                if(GetForegroundWindow()!=window)return null;
                BitmapData locked=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
                try {
                    byte[] data=new byte[locked.Stride*height];Marshal.Copy(locked.Scan0,data,0,data.Length);
                    byte[] packet;
                    if(cached) {
                        packet=DecodePacket(data,locked.Stride,width,height,0,0,cachedCell);
                        if(packet==null)cachedX=-1;
                    } else {
                        int x,y;double cell;
                        packet=Locate(data,locked.Stride,width,height,out x,out y,out cell);
                        if(packet!=null){cachedX=left+x;cachedY=top+y;cachedCell=cell;}
                    }
                    return packet==null?null:Convert.ToBase64String(packet);
                } finally {bitmap.UnlockBits(locked);}
            }
        } finally {if(oldDpi!=IntPtr.Zero)SetThreadDpiAwarenessContext(oldDpi);}
    }
}
'@
if ($CompileOnly) { Write-Output 'Optical helper compiled; no screen capture performed.'; exit 0 }
$allowed=[IO.Path]::GetFullPath($ExecutablePath)
if (!(Test-Path -LiteralPath $allowed -PathType Leaf)) { throw 'Configured game executable does not exist' }
$owner=Get-Process -Id $ParentPid -ErrorAction Stop
$started=$owner.StartTime
$parentPipe=if ([Console]::IsInputRedirected) { [WCIOpticalCapture]::WatchParentPipe() }
$lastWaiting=[DateTime]::MinValue
while ($true) {
 if ($parentPipe -and $parentPipe.IsCompleted) { break }
 $owner=Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
 if (!$owner -or $owner.StartTime -ne $started) { break }
 $waiting='WAIT marker'
 try { $packet=[WCIOpticalCapture]::Read($allowed) }
 catch { $packet=$null;$waiting='WAIT capture' }
 if ($parentPipe -and $parentPipe.IsCompleted) { break }
 if ($packet) { [Console]::Out.WriteLine('PACKET '+$packet) }
 elseif (([DateTime]::UtcNow-$lastWaiting).TotalSeconds -ge 5) { [Console]::Out.WriteLine($waiting);$lastWaiting=[DateTime]::UtcNow }
 if ($parentPipe) { if ($parentPipe.Wait(200)) { break } }
 else { Start-Sleep -Milliseconds 200 }
}
