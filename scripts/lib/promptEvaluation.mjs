export const qualityDimensions=Object.freeze(["identification","visibleSymptoms","differential","uncertainty","treatmentSafety","usefulness","hallucination","language","structuredValidity","conciseness"]);

// Scores are accepted only as independent human review records. Model-provided
// confidence, schema validity and catalog labels cannot supply missing scores.
export const summarizeBotanicalReview=(reviews,approvedMinimums)=>{
  if(!Array.isArray(reviews)||!reviews.length)return{status:"NOT VERIFIED",reason:"No independent reviewed cases"};
  if(reviews.some(r=>r.criticalTreatmentRegression===true))return{status:"BLOCKED",reason:"Critical treatment-safety regression"};
  const thresholdsReady=approvedMinimums&&qualityDimensions.every(k=>typeof approvedMinimums[k]==="number"&&approvedMinimums[k]>=0&&approvedMinimums[k]<=1);
  const reviewed=reviews.every(r=>r.reviewStatus==="independently_reviewed"&&typeof r.reviewerReference==="string"&&r.reviewerReference.trim()
    &&qualityDimensions.every(k=>typeof r.scores?.[k]==="number"&&r.scores[k]>=0&&r.scores[k]<=1));
  if(!thresholdsReady||!reviewed)return{status:"NOT VERIFIED",reason:"Independent labels, complete scores or approved thresholds missing"};
  const means=Object.fromEntries(qualityDimensions.map(k=>[k,reviews.reduce((s,r)=>s+r.scores[k],0)/reviews.length]));
  return{status:qualityDimensions.every(k=>means[k]>=approvedMinimums[k])?"REVIEW GATE PASSED":"BLOCKED",means,
    limitation:"This review summary is not a production activation mechanism or proof of population-wide quality"};
};

export const validatePromptEvaluationCase=value=>{
  if(!value||typeof value!=="object"||!/^[a-z0-9_-]{1,80}$/.test(value.id)||typeof value.image!=="string"
    ||value.image.includes("..")||value.image.includes("\\")||value.image.startsWith("/")||/^[a-z]:/i.test(value.image)
    ||value.approvedForEvaluation!==true||typeof value.rightsBasis!=="string"||!value.rightsBasis.trim()
    ||!["unreviewed","independently_reviewed","rejected"].includes(value.reviewStatus)
    ||typeof value.plantName!=="string"||typeof value.symptomNotes!=="string"
    ||!Array.isArray(value.referenceIdentities)||!Array.isArray(value.referenceVisibleSymptoms)||!Array.isArray(value.acceptableDifferentials)
    ||!Array.isArray(value.unsafeRecommendations)||typeof value.insufficientEvidence!=="boolean")throw Error("Invalid or unapproved evaluation case");
  return value;
};
