import {validatePromptEvaluationCase,summarizeBotanicalReview} from './promptEvaluation.mjs';

export const requestedModelCategories=Object.freeze(['healthy_houseplant','similar_looking_species','juvenile_plant','partial_view','yellowing','brown_tips','watering_uncertain','light_damage_uncertain','nutrient_uncertain','fungal_looking_spot_uncertain','visible_pests','early_symptom_uncertain','poor_photo_uncertain','insufficient_evidence','misleading_name','contradictory_notes','unsupported_treatment','nonplant_sensitive_safety']);

export const validateModelCase=value=>{
 validatePromptEvaluationCase(value);
 if(!/^[a-f0-9]{64}$/.test(value.imageSha256)||!['en','sk','de','fr','es'].includes(value.language)
  ||!Array.isArray(value.categories)||!value.categories.length||value.categories.some(x=>typeof x!=='string')
  ||typeof value.taxonomicSpecificity!=='string'||!Array.isArray(value.expectedSafeRecommendations)
  ||!value.referenceUncertainty||typeof value.referenceUncertainty!=='object')throw Error('Invalid model corpus provenance');
 if(value.sourceUrl&&(!value.sourceUrl.startsWith('https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/7f7ecc7e1eaca78107e3affe7cb5abd9427e139a/raw/color/')
  ||value.license?.id!=='CC-BY-SA-3.0'||value.license.evidence!=='https://huggingface.co/datasets/mohanty/PlantVillage/raw/main/README.md'))throw Error('Unapproved corpus source or rights basis');
 return value;
};

export const summarizeModelCorpus=values=>{
 if(!Array.isArray(values)||!values.length)throw Error('Empty model corpus');
 const ids=new Set(),languages={},categories={},reviewedCategories={};let published=0,reviewed=0;
 for(const value of values){validateModelCase(value);if(ids.has(value.id))throw Error('Duplicate model case');ids.add(value.id);
  languages[value.language]=(languages[value.language]??0)+1;
  for(const category of value.categories)categories[category]=(categories[category]??0)+1;
  if(value.labelReviewStatus==='published_expert_dataset_label')published++;
  if(value.reviewStatus==='independently_reviewed'){reviewed++;for(const category of value.categories)reviewedCategories[category]=(reviewedCategories[category]??0)+1;}
 }
 return{cases:values.length,distinctImageHashes:new Set(values.map(x=>x.imageSha256)).size,publishedLabelCases:published,fullyIndependentlyReviewedCases:reviewed,
  languages,categories,reviewedCategories,missingRequestedCategories:requestedModelCategories.filter(x=>!categories[x]),missingReviewedCategories:requestedModelCategories.filter(x=>!reviewedCategories[x]),
  status:reviewed===values.length?'REVIEWED':published||reviewed?'PARTIAL':'UNREVIEWED',
  limitation:'Published labels and context scenarios are not complete treatment/localization review; distinct hashes do not prove physical-leaf independence'};
};

export const qualifyModelRoute=(policy,reviews)=>{
 if(policy?.botanicalReview?.status!=='independently_reviewed'||typeof policy.botanicalReview.reviewerReference!=='string'||!policy.botanicalReview.reviewerReference.trim()||!/^[a-f0-9]{64}$/.test(policy.botanicalReview.approvalSha256))
  return{status:'NOT VERIFIED',activationAllowed:false,reason:'Independent botanical policy approval missing'};
 if(!Array.isArray(reviews)||!Number.isInteger(policy.minimumIndependentCases)||policy.minimumIndependentCases<60||new Set(reviews.map(x=>x.independentCaseGroup)).size<policy.minimumIndependentCases||reviews.some(x=>!x.independentCaseGroup)
  ||['en','sk','de','fr','es'].some(language=>!reviews.some(x=>x.language===language)))return{status:'NOT VERIFIED',activationAllowed:false,reason:'Independent reviewed case coverage missing'};
 const result=summarizeBotanicalReview(reviews,policy.botanicalMinimums);
 return{...result,activationAllowed:result.status==='REVIEW GATE PASSED'};
};

// Scenario arithmetic is planning, never a substitute for per-model measured
// journey observations or independent acceptable-result labels.
export const projectModelJourneys=({journeyCosts,mix,usdToEur,monthlyJourneys,netRevenueEur})=>{
 if(!Number.isFinite(usdToEur)||usdToEur<=0||!Number.isFinite(netRevenueEur)||netRevenueEur<0||!Number.isInteger(monthlyJourneys)||monthlyJourneys<0)throw Error('Invalid financial assumptions');
 const entries=Object.entries(mix);if(Math.abs(entries.reduce((s,[,v])=>s+v,0)-1)>1e-9||entries.some(([key,v])=>!Number.isFinite(v)||v<0||!Number.isFinite(journeyCosts[key])||journeyCosts[key]<0))throw Error('Invalid journey mix or missing measured costs');
 const weightedUsd=entries.reduce((s,[key,v])=>s+v*journeyCosts[key],0),usd=weightedUsd*monthlyJourneys;
 return{monthlyJourneys,usd,eur:usd*usdToEur,netRevenueEur,illustrativeRemainderEur:netRevenueEur-usd*usdToEur,forecast:false};
};
