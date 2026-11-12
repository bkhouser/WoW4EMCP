import { observation,questSchema,itemSchema,type Snapshot } from './model.js';
// Deliberately synthetic. Never imported into the real database.
export function makeSample(at=new Date().toISOString()):Snapshot {
  const entries=Array.from({length:38},(_,i)=>questSchema.parse({id:900000+i,name:`SAMPLE quest ${i+1}`,objectives:[],objectivesComplete:i===1,objectivesCoverage:'observed'}));
  entries[0]=questSchema.parse({id:1740,name:"SAMPLE — The Orb of Soran'ruk",objectivesComplete:false,objectivesCoverage:'observed',objectives:[
    {text:"Soran'ruk Fragment",current:0,required:3,complete:false,countEvidence:'api_fields'},
    {text:"Large Soran'ruk Fragment",current:1,required:1,complete:true,countEvidence:'api_fields'}]});
  return {schemaVersion:1,identity:{gameVersion:'forever',region:'us',scope:'normal',slug:'sample-examplewarlock',name:'SAMPLE Examplewarlock'},source:'sample',sample:true,capturedAt:at,observations:[
    observation('identity',{level:28,race:'Human',class:'WARLOCK',specialization:'Affliction',xp:1000,xpMax:30000,restedXp:0,goldCopper:12345,location:'SAMPLE zone',build:'fixture'},at),
    observation('quests',{entries,capacity:40,used:38,enumerationComplete:true},at),
    observation('equipment',{items:[itemSchema.parse({itemId:1001,name:'SAMPLE wand',slot:18,quantity:1,stats:{spellPower:4}})]},at),
    observation('bags',{items:[itemSchema.parse({itemId:730,name:'SAMPLE Murloc Eye',bag:0,slot:1,quantity:3}),itemSchema.parse({itemId:730,name:'SAMPLE Murloc Eye',bag:1,slot:2,quantity:5})]},at),
    observation('talents',{entries:[{id:17810,name:'SAMPLE Improved Corruption',rank:5,maxRank:5,tree:'Affliction'}],unspent:1,specialization:'Affliction'},at),
    {domain:'bank',coverage:'not_observed',basis:'unknown',observedAt:null,notes:['SAMPLE bank has never been opened.'],payload:null}
  ]};
}
