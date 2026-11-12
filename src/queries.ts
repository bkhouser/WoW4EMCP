import { z } from 'zod';
import { Store, freshness, type StoredObservation } from './store.js';
import { domains, payloadSchemas, type Domain, type Payload, type Quest, type Item } from './model.js';

export class Queries {
  constructor(readonly store:Store,readonly staleSeconds=900){}
  metadata(o:StoredObservation|null){return o?{id:o.id,characterKey:o.characterKey,identity:o.identity,source:o.source,sample:o.sample,
    observedAt:o.observedAt,syncedAt:o.syncedAt,capturedAt:o.capturedAt,coverage:o.coverage,basis:o.basis,notes:o.notes,transport:o.transport,freshness:freshness(o,new Date(),this.staleSeconds)}:null;}
  data(key:string,domain:Domain,limit=50,offset=0,observationId?:number){
    const current=this.store.current(key,domain),s=observationId===undefined?current.selected:this.store.observationById(key,observationId);
    if(observationId!==undefined&&(!s||s.domain!==domain))throw new Error('Observation does not belong to this character/domain');
    let data=s?.payload??null,total=0;
    if(data && typeof data==='object'){
      const payload=structuredClone(data) as Record<string,unknown>;
      const collection=['entries','items','flightNodes'].find(k=>Array.isArray(payload[k]));
      if(collection){const values=payload[collection] as unknown[];total=values.length;payload[collection]=values.slice(offset,offset+limit);}
      if(domain==='professions' && Array.isArray(payload.entries))for(const p of payload.entries as {recipes:unknown[];recipesTruncated:boolean}[]){if(p.recipes.length>50){p.recipes=p.recipes.slice(0,50);p.recipesTruncated=true;}}
      data=payload;
    }
    return {characterKey:key,identity:this.store.identity(key),domain,availability:s?.coverage??'not_observed',
      observation:this.metadata(s),data,total,offset,nextOffset:offset+limit<total?offset+limit:null,
      conflicting:current.conflicting,alternatives:current.alternatives.map(o=>this.metadata(o)!),selectionPolicy:current.selectionPolicy};
  }
  payload<D extends Domain>(key:string,domain:D):Payload<D>|null{
    const o=this.store.current(key,domain).selected;if(!o?.payload)return null;return payloadSchemas[domain].parse(o.payload) as Payload<D>;
  }
  overview(key:string){
    return {characterKey:key,identity:this.store.identity(key),sample:this.store.mode==='sample',status:this.data(key,'identity'),
      domains:domains.map(domain=>{const o=this.store.current(key,domain).selected;return {domain,coverage:o?.coverage??'not_observed',observedAt:o?.observedAt??null,freshness:freshness(o,new Date(),this.staleSeconds)};})};
  }
  questDetails(key:string,id:number){
    const active=this.payload(key,'quests')?.entries.find(q=>q.id===id)??null;
    // Historical evidence cannot mark a current repeatable occurrence turned in.
    const history=this.store.questEvidence(key,100,0,id);
    const unique=history.entries.map(e=>({...e.event,observation:this.metadata(e.observation)}));
    return {characterKey:key,questId:id,active,presence:active?'observed_in_log':'not_observed',
      questLogObservation:this.metadata(this.store.current(key,'quests').selected),history:unique,
      historySearch:`First 100 of ${history.total} deduplicated historical events/flags across all captures; get_completed_quests supports pagination.`,
      disposition:active?'current occurrence has no inferred turn-in':'unknown unless explicit history evidence identifies the relevant occurrence',
      chainCoverage:'not_observed',prerequisites:[],notes:['Log absence never proves completion, abandonment or unavailability. Completion flags do not identify a turn-in timestamp.']};
  }
  completed(key:string,limit=50,offset=0){
    const r=this.store.questEvidence(key,limit,offset);
    return {characterKey:key,coverage:'partial' as const,entries:r.entries.map(e=>({event:e.event,observation:this.metadata(e.observation)})),total:r.total,nextOffset:r.nextOffset,
      notes:['Deduplicated evidence across all stored captures, including prior sessions. Completion flags do not imply a known turn-in time; event collection starts when the addon is loaded.']};
  }
  analyze(key:string){
    const log=this.payload(key,'quests');const evidence=this.metadata(this.store.current(key,'quests').selected);
    return {characterKey:key,observation:evidence,capacity:log?.capacity??null,used:log?.used??null,
      freeSlots:log?.capacity!=null&&log.used!=null?Math.max(0,log.capacity-log.used):null,
      enumerationComplete:log?.enumerationComplete??false,
      objectivesReady:log?.entries.filter(q=>q.objectivesComplete===true).map(q=>({id:q.id,name:q.name,turnedIn:q.turnedIn}))??[],
      questsWithUnknownObjectives:log?.entries.filter(q=>q.objectivesCoverage!=='observed').map(q=>q.id)??[],
      abandonRecommendations:[],reason:'No automatic abandonment recommendation. Review active quest evidence, class/dungeon relevance, chain prerequisites and rewards; unknown metadata cannot justify abandoning.'};
  }
  search(key:string,query:string|undefined,itemId:number|undefined,limit=50,offset=0){
    const storage=['bags','bank','reagent_bank','account_bank'] as const;
    const locations: {storage:Domain;item:Item;observation:ReturnType<Queries['metadata']>}[]=[];
    const coverage=storage.map(domain=>{
      const o=this.store.current(key,domain).selected,p=o?.payload?payloadSchemas[domain].parse(o.payload):null;
      for(const item of p?.items??[])if((itemId!==undefined&&item.itemId===itemId)||(query!==undefined&&item.name?.toLowerCase().includes(query.toLowerCase())))locations.push({storage:domain,item,observation:this.metadata(o)});
      return {storage:domain,coverage:o?.coverage??'not_observed',observation:this.metadata(o),open:p&&'open'in p?p.open:null};
    });
    const exact=coverage.every(c=>c.coverage==='observed'&&c.observation?.freshness.state==='fresh')&&locations.every(l=>l.item.quantity!==null);
    return {characterKey:key,query:query??null,itemId:itemId??null,locations:locations.slice(offset,offset+limit),totalLocations:locations.length,
      nextOffset:offset+limit<locations.length?offset+limit:null,knownQuantity:locations.reduce((n,l)=>n+(l.item.quantity??0),0),
      totalQuantity:exact?locations.reduce((n,l)=>n+(l.item.quantity??0),0):null,
      quantitySemantics:'Known quantity sums counted matching rows at their own observation times. Uncovered storage, stale rows and unknown quantities prevent a complete current total.',storageCoverage:coverage};
  }
  compare(key:string,leftId:number,rightId:number){
    const items=[...(this.payload(key,'equipment')?.items??[]),...(this.payload(key,'bags')?.items??[])];
    const left=items.find(i=>i.itemId===leftId)??null,right=items.find(i=>i.itemId===rightId)??null;
    const sharedStats=left&&right?Object.keys(left.stats).filter(k=>k in right.stats):[];
    return {characterKey:key,left,right,deltas:sharedStats.map(stat=>({stat,rightMinusLeft:right!.stats[stat]-left!.stats[stat]})),
      observations:['equipment','bags'].map(d=>this.metadata(this.store.current(key,d as Domain).selected)),
      basis:'derived',notes:['Only stats observed on both items are subtracted. Missing stats are unknown, not zero. No damage simulation, set-bonus or spec ranking is implied.']};
  }
  changes(key:string,domain:Domain,limit=20,offset=0){
    const all=this.store.observations(key,domain,offset+limit+1);
    return {characterKey:key,domain,observations:all.slice(offset,offset+limit).map(o=>({observation:this.metadata(o),summary:domain==='identity'?o.payload:{sha256:importHash(o.payload)}})),
      nextOffset:all.length>offset+limit?offset+limit:null,
      notes:['Immutable observation history sorted by observed time. Different payload hashes indicate changes; omission alone never classifies a quest as abandoned or turned in.']};
  }
}
import {digest as importDigest} from './store.js';
function importHash(value:unknown){return importDigest(JSON.stringify(value));}
