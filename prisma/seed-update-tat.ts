/**
 * prisma/seed-update-tat.ts
 *
 * DiagSync — Turnaround Time (TAT) Bulk Update Script
 * ─────────────────────────────────────────────────────
 * Updates turnaroundMinutes for 495 diagnostic tests.
 *
 * SAFETY:  ONLY updates turnaroundMinutes. No deletes, no creates.
 * SOURCE:  DiagSync TAT Reference Guide v1.0 (globally benchmarked).
 * TAT DEF: Start Test → Result Submitted. Excludes MD review / release.
 *
 * ── PRODUCTION CONTROLS ──────────────────────────────────────────────────────
 *
 *   DRY_RUN = true   →  No DB writes. Logs what WOULD be changed.
 *   DRY_RUN = false  →  Live mode. Writes to DB.
 *
 *   TARGET_ORG_ID = "<uuid>"  →  Scope updates to one organisation only.
 *   TARGET_ORG_ID = null      →  Update across all organisations.
 *
 * Usage:
 *   npx ts-node prisma/seed-update-tat.ts
 *   OR add to package.json scripts and call via tsx / ts-node.
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION CONTROL FLAGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DRY_RUN — Set to `true` for a safe preview run (NO DB writes).
 * Always verify output with DRY_RUN = true before setting to false.
 */
const DRY_RUN: boolean = false;

/**
 * TARGET_ORG_ID — Restrict updates to a single organisation.
 * Set to null to update all organisations.
 * Example: "clxyz123abc..."
 */
const TARGET_ORG_ID: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// TAT CATALOG
// Format: [testName, turnaroundMinutes]
// Matched case-insensitively against DiagnosticTest.name in DB.
// ─────────────────────────────────────────────────────────────────────────────
const TAT_CATALOG: [string, number][] = [

  // ── HAEMATOLOGY ────────────────────────────────────────────────────────────
  ["Full Blood Count", 90],
  ["Sickling Test", 45],
  ["G6PD Screening", 90],
  ["Bleeding Time & Clotting Time", 60],
  ["Haemoglobin (HB)", 60],
  ["Haematocrit (PCV)", 45],
  ["Reticulocyte Count", 60],
  ["Peripheral Blood Film", 90],
  ["Blood Film", 75],
  ["Blood Group", 45],
  ["Genotype", 60],
  ["Genotyping (Confirmatory)", 180],
  ["HB Electrophoresis", 240],
  ["Direct Coombs Test", 60],
  ["Indirect Coombs Test", 90],
  ["Cross Matching", 75],
  ["Prothrombin Time", 60],
  ["APTT", 60],
  ["Fibrinogen", 75],
  ["ESR", 90],
  ["D-Dimer", 60],
  ["DNA Paternity Test", 4320],
  ["Osmotic Fragility Test", 180],

  // ── CLINICAL CHEMISTRY ─────────────────────────────────────────────────────
  ["Fasting Blood Sugar", 60],
  ["Random Blood Sugar", 45],
  ["Liver Function Test", 150],
  ["Kidney Function Test", 150],
  ["Alkaline Phosphatase (ALP)", 90],
  ["B10 Chemistry Panel HbA1c", 120],
  ["Lipid Profile", 120],
  ["Triglyceride", 90],
  ["Cholesterol (Total)", 75],
  ["HDL-C", 90],
  ["AST (SGOT)", 75],
  ["ALT (SGPT)", 75],
  ["GGT", 90],
  ["Total Bilirubin", 90],
  ["Direct Bilirubin", 90],
  ["LDL-C", 90],
  ["Protein (Total)", 75],
  ["VLDL-C", 90],
  ["Albumin", 75],
  ["Electrolytes", 90],
  ["Urea", 75],
  ["Creatinine", 75],
  ["Blood Gases", 30],
  ["Blood pH", 30],
  ["Oxygen (O2)", 30],
  ["Carbon Dioxide (CO2)", 30],
  ["Calcium (Total)", 90],
  ["Ionized Calcium", 45],
  ["Lactate", 30],
  ["Uric Acid", 75],
  ["Pregnancy Test", 30],
  ["CRP", 90],
  ["Creatine Kinase", 90],
  ["Procalcitonin", 90],
  ["Amylase", 75],
  ["Lipase", 90],
  ["Comprehensive Metabolic Panel (CMP)", 150],
  ["Protein Electrophoresis", 300],
  ["Microalbumin", 90],
  ["Blood Lead Level", 240],
  ["Serum Folate", 180],
  ["Aflatoxin B1", 480],
  ["Drug Screen (Urine)", 60],
  ["Alcohol Level", 90],
  ["Ceruloplasmin", 180],
  ["Copper (Serum)", 240],
  ["Zinc (Serum)", 240],
  ["Magnesium (Serum)", 90],
  ["Phosphate (Serum)", 90],

  // ── CARDIAC MARKERS ────────────────────────────────────────────────────────
  ["Brain Natriuretic Peptide (NT-proBNP)", 90],
  ["CK-MB", 90],
  ["Troponin T", 60],
  ["Troponin I", 60],

  // ── HORMONES / ENDOCRINOLOGY ───────────────────────────────────────────────
  ["Thyroid Stimulating Hormone (TSH)", 150],
  ["Thyroxine (T4 Free)", 150],
  ["Thyroxine (T4 Total)", 150],
  ["Triiodothyronine (T3 Total)", 150],
  ["Triiodothyronine (T3 Free)", 150],
  ["Thyroid Function Tests (TFT)", 180],
  ["Thyroid Antibody Receptor (TRAb)", 180],
  ["Anti-Mullerian Hormone (AMH)", 180],
  ["Oestrogen (E2)", 180],
  ["Follicle Stimulating Hormone (FSH)", 150],
  ["Luteinizing Hormone (LH)", 150],
  ["Prolactin", 150],
  ["Hormonal Immunoassay Panel", 240],
  ["Progesterone", 180],
  ["Human Chorionic Gonadotropin (B-HCG)", 120],
  ["Testosterone", 180],
  ["Dehydroepiandrosterone Sulfate (DHEA-S)", 180],
  ["Cortisol", 150],
  ["Adrenocorticotropic Hormone (ACTH)", 180],
  ["Parathyroid Hormone (PTH)", 150],
  ["Human Growth Hormone", 180],

  // ── VITAMINS / MINERALS / IRON ─────────────────────────────────────────────
  ["Vitamin B12", 180],
  ["Vitamin D", 180],
  ["Ferritin", 150],
  ["Serum Iron", 90],
  ["Total Iron Binding Capacity (TIBC)", 120],

  // ── TUMOUR MARKERS ─────────────────────────────────────────────────────────
  ["Prostate Specific Antigen (PSA)", 150],
  ["Prostate Specific Antigen (Free)", 150],
  ["Carcinoembryonic Antigen (CEA)", 150],
  ["Alpha-Fetoprotein (AFP)", 150],
  ["CA-125 Test", 150],
  ["CA 19-9", 150],

  // ── IMMUNOLOGY / AUTOIMMUNE ────────────────────────────────────────────────
  ["Anti Nuclear Antibody (ANA)", 240],
  ["Double Stranded DNA Test (ds-DNA)", 240],
  ["Anti-CCP Antibody", 180],
  ["Anti-dsDNA Antibody", 240],
  ["Anti-TPO Antibody", 180],
  ["Anti-Thyroglobulin Antibody", 180],
  ["Rheumatoid Factor", 90],
  ["Immunoglobulin G (IgG)", 180],
  ["Immunoglobulin M (IgM)", 180],
  ["Immunoglobulin A (IgA)", 180],
  ["Immunoglobulin E (IgE)", 180],
  ["Complement C3", 180],
  ["Complement C4", 180],
  ["Lupus Anticoagulant", 240],
  ["Antiphospholipid Antibodies", 240],
  ["Activated Protein C Resistance", 240],
  ["Serum Protein C", 240],
  ["Serum Protein S", 240],
  ["Anti-Streptolysin O (ASO) Titre", 90],
  ["ASO Titre", 90],

  // ── SEROLOGY ───────────────────────────────────────────────────────────────
  ["Hepatitis B Surface Antigen (HBsAg)", 60],
  ["HBsAg-Quantitative", 180],
  ["HBsAg-Qualitative", 60],
  ["HBsAb-Quantitative", 180],
  ["HBsAb-Qualitative", 60],
  ["HBeAg-Quantitative", 180],
  ["HBeAg-Qualitative", 60],
  ["HBeAb-Quantitative", 180],
  ["HBeAb-Qualitative", 60],
  ["HBcAb-Quantitative", 180],
  ["HBcAb-Qualitative", 60],
  ["HBV 5 Panel Test", 90],
  ["HBV DNA Panel", 480],
  ["HBV DNA Viral Load", 480],
  ["HBV RNA by RT-PCR", 480],
  ["HBV Qualitative (Confirmatory Test)", 480],
  ["Hepatitis B Screening", 60],
  ["Hepatitis C Screening", 60],
  ["HCV RNA Viral Load", 480],
  ["HCV Genotyping", 1440],
  ["HCV Qualitative (Confirmatory Test)", 480],
  ["HIV Screening", 60],
  ["HIV 1 & II Confirmatory Test", 180],
  ["CD4 T Cell Count", 240],
  ["CD4 T Cell Percentage", 240],
  ["CD8 T Cell Count", 240],
  ["Widal Test", 90],
  ["Typhoid IgM/IgG Rapid Test", 30],
  ["Dengue NS1 Antigen", 45],
  ["H. Pylori Antibody (Serum)", 60],
  ["H. Pylori Antigen (Stool)", 60],
  ["H. Pylori Screening", 60],
  ["Leptospira Screening", 120],
  ["Hepatitis A Screening", 60],
  ["Hepatitis E Screening", 90],
  ["Hepatitis D Screening", 120],
  ["Brucella Screening", 90],
  ["VDRL", 90],
  ["Chlamydia", 90],
  ["Gonorrhoea Screening", 90],
  ["Trichomonas Vaginalis", 60],
  ["Candida Screening", 60],
  ["Yellow Fever IgM", 90],
  ["Monkeypox PCR", 480],
  ["COVID-19 Antigen", 30],
  ["COVID-19 Antibody (IgM/IgG)", 45],
  ["Cytomegalovirus (CMV) IgM", 120],
  ["Epstein-Barr Virus (EBV) IgM", 120],
  ["Toxoplasma IgM", 120],
  ["Rubella IgM", 120],
  ["Measles IgM", 120],
  ["Meningitis Screening", 120],
  ["Tuberculosis Antigen Test", 90],

  // ── MICROBIOLOGY ──────────────────────────────────────────────────────────
  ["Sputum AFB (X2)", 90],
  ["Gram Staining", 30],
  ["Mantoux Test", 2880],
  ["Skin Scraping Analysis", 90],
  ["Urine M/C/S", 2880],
  ["Stool M/C/S", 2880],
  ["Sputum M/C/S", 2880],
  ["Blood Culture/Sensitivity", 4320],
  ["High Vaginal Swab (HVS) M/C/S", 2880],
  ["Endocervical Swab (ECS) M/C/S", 2880],
  ["Urethral Swab M/C/S", 2880],
  ["Semen M/C/S", 2880],
  ["Skin/Nail Scraping M/C/S", 4320],
  ["Other Swabs/Fluid M/C/S", 2880],

  // ── URINALYSIS / STOOL / SEMEN ─────────────────────────────────────────────
  ["Urinalysis", 60],
  ["Stool Analysis", 90],
  ["Faecal Occult Blood (FOB)", 45],
  ["Malaria Parasite", 60],
  ["Malaria Parasites (MP)", 60],
  ["Semen Analysis", 90],

  // ── RADIOLOGY — X-RAY ──────────────────────────────────────────────────────
  ["Chest X-Ray (PA)", 45],
  ["Chest X-Ray (AP)", 45],
  ["Chest X-Ray (Decubitus)", 45],
  ["Chest X-Ray (Apical Lordotic)", 45],
  ["Chest X-Ray (AP & LAT)", 60],
  ["Chest X-Ray (Lateral)", 45],
  ["Chest X-Ray (AP Supine)", 45],
  ["Chest X-Ray (AP Erect)", 45],
  ["Chest X-Ray (Expiratory View)", 45],
  ["Skull X-Ray (AP & LAT)", 45],
  ["Skull X-Ray (Lateral)", 45],
  ["Skull X-Ray (Towne View)", 45],
  ["Skull X-Ray (SMV View)", 45],
  ["PNS X-Ray (Waters View)", 45],
  ["PNS X-Ray (Caldwell View)", 45],
  ["Nasal Bones X-Ray", 45],
  ["Facial Bones X-Ray", 45],
  ["Orbital X-Ray", 45],
  ["Cervical Spine X-Ray (AP & LAT)", 45],
  ["Thoracic Spine X-Ray (AP & LAT)", 45],
  ["Lumbosacral Spine X-Ray (AP & LAT)", 45],
  ["Sacrum & Coccyx X-Ray", 45],
  ["Scoliosis X-Ray (Full Spine)", 60],
  ["Shoulder X-Ray (AP & LAT)", 45],
  ["Shoulder Stress View X-Ray", 45],
  ["Clavicle X-Ray (AP & LAT)", 45],
  ["Scapula X-Ray (AP & LAT)", 45],
  ["Acromioclavicular Joint X-Ray", 45],
  ["Humerus X-Ray (AP & LAT)", 45],
  ["Elbow X-Ray (AP & LAT)", 45],
  ["Forearm X-Ray (AP & LAT)", 45],
  ["Wrist X-Ray (AP & LAT)", 45],
  ["Hand X-Ray (AP & LAT)", 45],
  ["Fingers X-Ray (AP & LAT)", 45],
  ["Pelvis X-Ray (AP)", 45],
  ["Pelvis X-Ray (Lateral)", 45],
  ["Pelvis X-Ray (AP & LAT)", 60],
  ["Pelvis X-Ray (Inlet View)", 45],
  ["Pelvis X-Ray (Outlet View)", 45],
  ["Sacroiliac Joint X-Ray (AP & Oblique)", 45],
  ["Hip X-Ray (AP & LAT)", 45],
  ["Hip X-Ray (Cross-Table Lateral)", 45],
  ["Femur X-Ray (AP & LAT)", 45],
  ["Leg X-Ray (AP & LAT)", 45],
  ["Knee X-Ray (AP & LAT)", 45],
  ["Knee X-Ray (Skyline View)", 45],
  ["Knee X-Ray (Tunnel View)", 45],
  ["Tibia & Fibula X-Ray (AP & LAT)", 45],
  ["Ankle X-Ray (AP & LAT)", 45],
  ["Ankle X-Ray (Mortise View)", 45],
  ["Foot X-Ray (AP & LAT)", 45],
  ["Foot X-Ray (Oblique)", 45],
  ["Toes X-Ray (AP & LAT)", 45],
  ["Toes X-Ray (Oblique)", 45],
  ["Calcaneus X-Ray", 45],
  ["Abdomen X-Ray (Erect)", 45],
  ["Abdomen X-Ray (Supine)", 45],
  ["Abdomen X-Ray (Decubitus)", 45],
  ["KUB X-Ray", 45],
  ["Soft Tissue Neck X-Ray", 45],
  ["Foreign Body Localization", 60],
  ["Bone Age X-Ray", 60],
  ["Stress View X-Ray", 45],
  ["Skeletal Survey", 90],
  ["Babygram", 60],
  ["Digital X-Ray Skull", 45],
  ["Digital X-Ray Mandible", 45],
  ["Digital X-Ray TMJ", 45],
  ["Digital X-Ray Chest", 45],
  ["Digital X-Ray Shoulder", 45],
  ["Digital X-Ray Humerus", 45],
  ["Digital X-Ray Elbow", 45],
  ["Digital X-Ray Forearm", 45],
  ["Digital X-Ray Wrist", 45],
  ["Digital X-Ray Hand", 45],
  ["Digital X-Ray Cervical Spine", 45],
  ["Digital X-Ray Thoracic Spine", 45],
  ["Digital X-Ray Lumbo-Sacral Spine", 45],
  ["Digital X-Ray Pelvis/Hip", 45],
  ["Digital X-Ray Femur", 45],
  ["Digital X-Ray Knee", 45],
  ["Digital X-Ray Tibia-Fibula", 45],
  ["Digital X-Ray Ankle", 45],
  ["Digital X-Ray Foot", 45],
  ["Digital X-Ray Paranasal Sinuses", 45],
  ["Digital X-Ray Post Nasal Space", 45],
  ["Digital X-Ray Trans-Cranial", 45],
  ["Digital X-Ray Clavicle", 45],
  ["Digital X-Ray Ribs", 45],
  ["Digital X-Ray Sternum", 45],
  ["Digital X-Ray Sacrum/Coccyx", 45],
  ["Digital X-Ray Abdomen (Erect)", 45],
  ["Digital X-Ray Abdomen (Supine)", 45],
  ["Digital X-Ray Facial Bones", 45],
  ["Digital X-Ray Mastoid", 45],
  ["Plain X-Ray Abdomen", 45],

  // ── CONTRAST / SPECIAL RADIOLOGY ──────────────────────────────────────────
  ["Barium Swallow", 60],
  ["Barium Meal", 90],
  ["Barium Follow-Through", 180],
  ["Barium Enema", 90],
  ["Intravenous Urography (IVU)", 120],
  ["Hysterosalpingography (HSG)", 60],
  ["Micturating Cystourethrogram (MCU)", 75],
  ["Barium Swallow (Single Contrast)", 60],
  ["Barium Swallow (Double Contrast)", 75],
  ["Barium Meal (Single Contrast)", 90],
  ["Barium Meal (Double Contrast)", 90],
  ["Small Bowel Follow-Through (SBFT)", 180],
  ["Enteroclysis", 180],
  ["Barium Enema (Single Contrast)", 90],
  ["Barium Enema (Double Contrast)", 90],
  ["Water-Soluble Contrast Enema", 90],
  ["IVU/IVP (Plain + Contrast + Delayed)", 120],
  ["Retrograde Urethrogram (RGU)", 60],
  ["Cystogram", 60],
  ["Nephrostogram", 60],
  ["Loopogram", 60],
  ["Percutaneous Transhepatic Cholangiogram (PTC)", 90],
  ["Cerebral Angiogram (DSA)", 120],
  ["Coronary Angiogram", 120],
  ["Pulmonary Angiogram", 120],
  ["Venogram", 90],
  ["Arthrogram", 75],
  ["Myelogram", 120],
  ["Fistulography", 60],
  ["Retrograde Pyelography (RUCG)", 75],
  ["Sialography", 60],
  ["Mammography", 60],
  ["Sono-HSG", 75],
  ["Barium Meal/Follow Through", 180],

  // ── ULTRASOUND ─────────────────────────────────────────────────────────────
  ["Abdominal Ultrasound", 60],
  ["Pelvic Ultrasound", 60],
  ["Obstetric Ultrasound", 60],
  ["Breast Ultrasound", 60],
  ["Thyroid Ultrasound", 60],
  ["Scrotal Ultrasound", 60],
  ["Prostate Ultrasound", 60],
  ["Renal Ultrasound", 60],
  ["Doppler Ultrasound", 90],
  ["Abdominal Scan", 60],
  ["Pelvic Scan", 60],
  ["Abdominopelvic Scan", 60],
  ["Obstetric/Fetal Ultrasound", 75],
  ["Breast Scan", 60],
  ["Occular Scan", 60],
  ["Transrectal/Prostate Scan", 75],
  ["Thyroid Scan", 60],
  ["Scrotal/Testicular Scan", 60],
  ["Renal Scan", 60],
  ["Neck Scan", 60],
  ["Liver/Gallbladder Scan", 60],
  ["Musculoskeletal Scan", 60],
  ["Salivary Gland Scan", 60],
  ["Soft Tissue Scan", 60],
  ["Folliculometry (Follicular Tracking)", 60],
  ["Neck Ultrasound", 60],
  ["Pelvic Ultrasound (Transvaginal Scan - TVS)", 75],
  ["Pelvic Ultrasound (Transabdominal)", 60],
  ["FAST Scan (Abdominal Windows)", 30],
  ["FAST Scan (Extended eFAST)", 45],
  ["Carotid Doppler Ultrasound", 90],
  ["Renal Artery Doppler Ultrasound", 90],
  ["Lower Limb Venous Doppler (DVT Scan)", 90],
  ["Obstetric Ultrasound (Anomaly Scan)", 90],
  ["Obstetric Ultrasound (NT Scan)", 75],
  ["Obstetric Ultrasound (Growth Scan)", 75],
  ["Obstetric Ultrasound (Biophysical Profile)", 90],
  ["Prostate Biopsy (Ultrasound Guided)", 90],
  ["Liver Biopsy (Ultrasound Guided)", 90],
  ["Kidney Biopsy (Ultrasound Guided)", 90],
  ["Breast Biopsy (Ultrasound Guided)", 90],
  ["Thyroid Biopsy (Ultrasound Guided)", 75],

  // ── CT ─────────────────────────────────────────────────────────────────────
  ["CT Brain", 90],
  ["CT Chest", 90],
  ["CT Abdomen", 90],
  ["CT Pelvis", 90],
  ["CT Spine", 90],
  ["CT Angiography", 120],
  ["CT Sinuses", 75],
  ["CT Orbit", 75],
  ["CT KUB (Non-Contrast)", 75],
  ["CT Pulmonary Angiogram (CTPA)", 90],
  ["CT Coronary Angiography (CTCA)", 120],
  ["CT Brain (With Contrast)", 90],
  ["CT Brain Angiography (CTA)", 120],
  ["CT Brain Venography (CTV)", 120],
  ["CT Cervical Spine", 90],
  ["CT Thoracic Spine", 90],
  ["CT Lumbar Spine", 90],
  ["CT Abdomen and Pelvis (With Contrast)", 120],
  ["CT Chest (HRCT)", 90],
  ["CT Chest (Low Dose)", 75],
  ["CT Chest Abdomen Pelvis (Staging)", 120],
  ["CT Urography (3-Phase)", 150],
  ["CT Enterography", 120],
  ["CT Colonography (Virtual Colonoscopy)", 120],
  ["CTA Aorta (Thoracoabdominal)", 120],
  ["CTA Carotid Arteries", 90],
  ["CTA Renal Arteries", 90],
  ["CTA Mesenteric Arteries", 90],
  ["CT Perfusion Brain", 120],
  ["CT Whole Body (Pan-Scan)", 90],
  ["CT-Guided Biopsy", 120],
  ["CT-Guided Drainage", 120],
  ["CT-Guided Radiofrequency Ablation", 180],
  ["CT Head Routine", 75],
  ["CT Head Neuro", 90],
  ["CT Inner Ear", 75],
  ["CT Sinus", 75],
  ["CT Dental", 60],
  ["CT Neck", 90],
  ["CT Shoulder", 90],
  ["CT Lower Extremities", 90],
  ["CT Cardiac Study", 120],
  ["CT Vascular", 120],
  ["CT Cranial Angiography", 120],
  ["CT Carotid Angiography", 90],
  ["CT Carotid Digital Subtraction", 120],
  ["CT Thoracic Angiography", 120],
  ["CT Thorax Routine", 90],
  ["CT Thorax HR", 90],
  ["CT Lung Low Dose", 75],
  ["CT Upper Extremities", 90],
  ["CT Calcium Scoring (CAC)", 75],

  // ── MRI ────────────────────────────────────────────────────────────────────
  ["MRI Brain", 120],
  ["MRI Spine", 120],
  ["MRI Abdomen", 150],
  ["MRI Pelvis", 150],
  ["MRI Spine (Cervical)", 120],
  ["MRI Spine (Lumbar)", 120],
  ["MRI Knee", 120],
  ["MRI Shoulder", 120],
  ["MRI Abdomen/Pelvis", 180],
  ["MRCP (MR Cholangiopancreatography)", 120],
  ["MRA Brain (TOF)", 120],
  ["MRV Brain", 120],
  ["Cardiac MRI (CMR)", 180],

  // ── ENDOSCOPY ──────────────────────────────────────────────────────────────
  ["OGD / EGD (Diagnostic)", 90],
  ["OGD / EGD (With Biopsy)", 120],
  ["Colonoscopy (Diagnostic)", 120],
  ["Colonoscopy (With Biopsy)", 150],
  ["Colonoscopy (With Polypectomy)", 150],
  ["Flexible Sigmoidoscopy", 90],
  ["Proctoscopy", 60],
  ["ERCP (Diagnostic)", 150],
  ["ERCP (With Stenting)", 180],
  ["Endoscopic Ultrasound (EUS)", 120],
  ["Endoscopic Ultrasound (EUS-FNA)", 150],
  ["Flexible Bronchoscopy", 120],
  ["EBUS (Endobronchial Ultrasound)", 150],
  ["Flexible Laryngoscopy", 60],
  ["Flexible Cystoscopy", 75],
  ["Ureteroscopy", 120],
  ["Hysteroscopy (Diagnostic)", 90],
  ["Colposcopy", 75],
  ["Medical Thoracoscopy", 180],
  ["VATS (Diagnostic)", 240],
  ["Upper GI Endoscopy", 90],
  ["Sigmoidoscopy/Colonoscopy", 120],

  // ── CARDIOLOGY — ECG ───────────────────────────────────────────────────────
  ["Resting ECG (12-lead)", 30],
  ["6-Lead ECG", 30],
  ["3-Lead ECG (Monitoring)", 20],
  ["15-Lead ECG", 30],
  ["18-Lead ECG", 30],
  ["Signal-Averaged ECG (SAECG)", 60],
  ["Stress ECG", 90],
  ["Treadmill Test (TMT)", 90],
  ["Exercise Stress Test (Bruce Protocol)", 90],
  ["Exercise Stress Test (Modified Bruce)", 90],
  ["Tilt Table Test", 120],
  ["Holter Monitor (24-hour)", 1440],
  ["Holter Monitor (48-hour)", 2880],
  ["Holter Monitor (72-hour)", 4320],
  ["Holter Monitor (7-day)", 10080],
  ["Holter Monitor (14-day)", 20160],
  ["External Loop Recorder (30-day)", 43200],
  ["Ambulatory ECG (Holter)", 1440],

  // ── CARDIOLOGY — ECHO ──────────────────────────────────────────────────────
  ["2D Echocardiography", 90],
  ["Doppler Echocardiography", 90],
  ["Colour Doppler Echocardiography", 90],
  ["PW Doppler Echocardiography", 90],
  ["CW Doppler Echocardiography", 90],
  ["Tissue Doppler Imaging (TDI)", 90],
  ["3D Echocardiography", 120],
  ["4D Echocardiography", 120],
  ["Contrast Echo (Bubble Study)", 90],
  ["Fetal Echocardiography", 120],
  ["Stress Echocardiography", 150],
  ["Transesophageal Echo (TEE)", 120],

  // ── CARDIOLOGY — VASCULAR ──────────────────────────────────────────────────
  ["Carotid Doppler", 90],
  ["Peripheral Doppler", 90],
  ["Venous Doppler", 90],
  ["Arterial Doppler", 90],
  ["Nuclear Myocardial Perfusion Imaging", 480],
  ["Electrophysiology Study (EPS)", 240],
];

// ─────────────────────────────────────────────────────────────────────────────
// ALTERNATE NAME ALIASES
// Some tests exist in DB under slightly different names.
// Each entry: [canonical name in TAT_CATALOG, ...aliases to also try]
// ─────────────────────────────────────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  "Full Blood Count":                         ["Full Blood Count (FBC)", "FBC", "Complete Blood Count", "CBC"],
  "Hepatitis B Surface Antigen (HBsAg)":      ["HBsAg", "Hepatitis B Surface Antigen", "HBsAg Rapid Test"],
  "Liver Function Test":                      ["Liver Function Tests", "LFT"],
  "Kidney Function Test":                     ["Kidney Function Tests", "KFT", "Renal Function Test"],
  "Malaria Parasite":                         ["Malaria Parasites", "MP", "Malaria RDT"],
  "Malaria Parasites (MP)":                   ["Malaria Parasites (MP)", "Malaria Parasite"],
  "HIV Screening":                            ["HIV Screen", "HIV Test", "HIV 1&2 Screening"],
  "HIV 1 & II Confirmatory Test":             ["HIV 1 & 2 Confirmatory", "HIV Confirmatory", "HIV Western Blot"],
  "Widal Test":                               ["Widal", "Widal Agglutination Test"],
  "Urine M/C/S":                             ["Urine Culture", "Urine MCS", "Urine Culture/Sensitivity", "Urinalysis M/C/S"],
  "Stool M/C/S":                             ["Stool Culture", "Stool MCS"],
  "Sputum M/C/S":                            ["Sputum Culture", "Sputum MCS"],
  "Blood Culture/Sensitivity":               ["Blood Culture", "Blood C/S", "Blood Culture Sensitivity"],
  "High Vaginal Swab (HVS) M/C/S":          ["HVS M/C/S", "HVS Culture", "HVS MCS"],
  "Endocervical Swab (ECS) M/C/S":          ["ECS M/C/S", "ECS Culture", "Endocervical Swab"],
  "Urethral Swab M/C/S":                    ["Urethral Swab Culture"],
  "Semen M/C/S":                            ["Semen Culture"],
  "Skin/Nail Scraping M/C/S":              ["Skin Scraping MCS", "Nail Scraping Culture"],
  "Other Swabs/Fluid M/C/S":              ["Wound Swab MCS", "Fluid Culture"],
  "Faecal Occult Blood (FOB)":             ["FOB", "Faecal Occult Blood", "Fecal Occult Blood"],
  "Typhoid IgM/IgG Rapid Test":           ["Typhoid Rapid Test", "Typhoid IgM", "Typhoid IgG"],
  "H. Pylori Antibody (Serum)":           ["H Pylori Antibody", "Helicobacter Pylori Antibody", "H. Pylori Serum"],
  "H. Pylori Antigen (Stool)":            ["H Pylori Antigen", "Helicobacter Pylori Stool Antigen"],
  "H. Pylori Screening":                  ["H Pylori Screen", "Helicobacter Pylori Screening", "H. Pylori Test"],
  "Bleeding Time & Clotting Time":        ["Bleeding Time and Clotting Time", "BT/CT", "BTCT"],
  "Prothrombin Time":                     ["PT", "PT/INR", "INR"],
  "Fasting Blood Sugar":                  ["FBS", "Fasting Glucose"],
  "Random Blood Sugar":                   ["RBS", "Random Glucose", "RBG"],
  "Prostate Specific Antigen (PSA)":      ["PSA Total", "Total PSA", "PSA"],
  "Prostate Specific Antigen (Free)":     ["Free PSA", "PSA Free"],
  "HBV DNA Viral Load":                   ["HBV DNA", "Hepatitis B DNA Viral Load"],
  "HCV RNA Viral Load":                   ["HCV RNA", "Hepatitis C RNA Viral Load"],
  "CD4 T Cell Count":                     ["CD4 Count", "CD4"],
  "CD4 T Cell Percentage":                ["CD4 Percent", "CD4%"],
  "CD8 T Cell Count":                     ["CD8 Count", "CD8"],
  "Resting ECG (12-lead)":               ["ECG", "12-Lead ECG", "Electrocardiogram", "EKG"],
  "2D Echocardiography":                  ["Echo", "2D Echo", "Echocardiogram", "TTE"],
  "Chest X-Ray (PA)":                     ["CXR PA", "Chest PA", "CXR (PA)"],
  "Chest X-Ray (AP)":                     ["CXR AP", "Chest AP", "CXR (AP)"],
  "Abdominal Ultrasound":                 ["Abdominal Scan", "USS Abdomen"],
  "Pelvic Ultrasound":                    ["Pelvic Scan", "USS Pelvis"],
  "Abdominopelvic Ultrasound":            ["Abdominopelvic Scan", "USS Abdominopelvic"],
  "Obstetric Ultrasound":                 ["Obstetric Scan", "Antenatal Scan", "ANC Scan"],
  "Thyroid Stimulating Hormone (TSH)":    ["TSH", "Thyroid Stimulating Hormone"],
  "Anti-Mullerian Hormone (AMH)":         ["AMH"],
  "Oestrogen (E2)":                       ["Estradiol", "E2", "Oestrogen"],
  "Follicle Stimulating Hormone (FSH)":   ["FSH"],
  "Luteinizing Hormone (LH)":             ["LH"],
  "Human Chorionic Gonadotropin (B-HCG)": ["Beta HCG", "B-HCG", "Serum HCG", "hCG"],
  "Dehydroepiandrosterone Sulfate (DHEA-S)": ["DHEA-S", "DHEAS"],
  "Adrenocorticotropic Hormone (ACTH)":   ["ACTH"],
  "Brain Natriuretic Peptide (NT-proBNP)": ["NT-proBNP", "BNP", "NT proBNP"],
  "Carcinoembryonic Antigen (CEA)":       ["CEA"],
  "Alpha-Fetoprotein (AFP)":              ["AFP"],
  "CA-125 Test":                          ["CA-125", "CA125"],
  "Anti Nuclear Antibody (ANA)":          ["ANA"],
  "Double Stranded DNA Test (ds-DNA)":    ["dsDNA", "ds-DNA", "Anti-dsDNA"],
  "Total Iron Binding Capacity (TIBC)":   ["TIBC"],
  "MRCP (MR Cholangiopancreatography)":   ["MRCP"],
  "MRA Brain (TOF)":                      ["MRA Brain", "MRA"],
  "Nuclear Myocardial Perfusion Imaging": ["MPI", "MIBI Scan", "Thallium Scan"],
  "Electrophysiology Study (EPS)":        ["EPS"],
  "CT Pulmonary Angiogram (CTPA)":        ["CTPA"],
  "CT Coronary Angiography (CTCA)":       ["CTCA", "Coronary CT"],
  "Comprehensive Metabolic Panel (CMP)":  ["CMP"],
  "Intravenous Urography (IVU)":          ["IVU", "IVP"],
  "Hysterosalpingography (HSG)":          ["HSG"],
  "Micturating Cystourethrogram (MCU)":   ["MCU", "MCUG", "VCUG"],
};

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TRACKING
// ─────────────────────────────────────────────────────────────────────────────

interface TestResult {
  catalogName:   string;
  matchedName:   string | null;
  oldTat:        number | null;
  newTat:        number;
  status:        "UPDATED" | "SKIPPED" | "MISSING" | "ERROR";
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the org filter clause for Prisma WHERE conditions.
 * Returns an empty object if TARGET_ORG_ID is null (no restriction).
 */
function orgFilter(): Record<string, unknown> {
  if (TARGET_ORG_ID === null) return {};
  return { organizationId: TARGET_ORG_ID };
}

/**
 * Fetch the first matching DiagnosticTest record for a given name.
 * Applies TARGET_ORG_ID scoping if set.
 * Returns null if not found.
 */
async function findExistingRecord(
  name: string,
  attempt = 0
): Promise<{ id: string; name: string; turnaroundMinutes: number | null } | null> {
  try {
    const record = await prisma.diagnosticTest.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...orgFilter(),
      },
      select: {
        id: true,
        name: true,
        turnaroundMinutes: true,
      },
    });
    return record ?? null;
  } catch (err: unknown) {
    if (attempt < 3) {
      await delay(500 * (attempt + 1));
      return findExistingRecord(name, attempt + 1);
    }
    throw err;
  }
}

/**
 * Execute the TAT update for a specific record by ID.
 * Only called when DRY_RUN = false and value has actually changed.
 * Retries up to 3 times on transient failure.
 */
async function performUpdate(
  id: string,
  tat: number,
  attempt = 0
): Promise<void> {
  try {
    await prisma.diagnosticTest.update({
      where: { id },
      data: { turnaroundMinutes: tat },
    });
  } catch (err: unknown) {
    if (attempt < 3) {
      await delay(500 * (attempt + 1));
      return performUpdate(id, tat, attempt + 1);
    }
    throw err;
  }
}

/**
 * Process a single catalog entry:
 * 1. Try canonical name first, then aliases.
 * 2. Fetch existing record.
 * 3. Compare old vs new TAT.
 * 4. Skip if unchanged. Update if changed (unless DRY_RUN).
 * 5. Always returns a TestResult — never throws.
 */
async function processEntry(
  catalogName: string,
  newTat: number
): Promise<TestResult> {
  const namesToTry: string[] = [catalogName, ...(ALIASES[catalogName] ?? [])];

  let existingRecord: { id: string; name: string; turnaroundMinutes: number | null } | null = null;
  let matchedName: string | null = null;

  // ── Step 1: Find matching record in DB ──────────────────────────────────────
  for (const nameAttempt of namesToTry) {
    try {
      existingRecord = await findExistingRecord(nameAttempt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        catalogName,
        matchedName: null,
        oldTat: null,
        newTat,
        status: "ERROR",
        errorMessage: `DB lookup failed for "${nameAttempt}": ${message}`,
      };
    }

    if (existingRecord !== null) {
      matchedName = existingRecord.name;
      break;
    }
  }

  // ── Step 2: Handle missing ──────────────────────────────────────────────────
  if (existingRecord === null || matchedName === null) {
    return {
      catalogName,
      matchedName: null,
      oldTat: null,
      newTat,
      status: "MISSING",
    };
  }

  const oldTat = existingRecord.turnaroundMinutes ?? null;

  // ── Step 3: Skip if value unchanged ────────────────────────────────────────
  if (oldTat === newTat) {
    return {
      catalogName,
      matchedName,
      oldTat,
      newTat,
      status: "SKIPPED",
    };
  }

  // ── Step 4: Update (or simulate in dry-run) ─────────────────────────────────
  if (!DRY_RUN) {
    try {
      await performUpdate(existingRecord.id, newTat);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        catalogName,
        matchedName,
        oldTat,
        newTat,
        status: "ERROR",
        errorMessage: `Update failed for "${matchedName}" (id: ${existingRecord.id}): ${message}`,
      };
    }
  }

  return {
    catalogName,
    matchedName,
    oldTat,
    newTat,
    status: "UPDATED",
  };
}

/**
 * Print a single result line to stdout.
 */
function logResult(result: TestResult): void {
  const label    = result.matchedName ?? result.catalogName;
  const oldStr   = result.oldTat !== null ? `${result.oldTat} min` : "null";
  const newStr   = `${result.newTat} min`;

  switch (result.status) {
    case "UPDATED":
      console.log(`  [${DRY_RUN ? "DRY-RUN: WOULD UPDATE" : "UPDATED"}] ${label} → ${oldStr} → ${newStr}`);
      break;
    case "SKIPPED":
      console.log(`  [SKIPPED]  ${label} → already ${newStr}`);
      break;
    case "MISSING":
      console.warn(`  [MISSING]  "${result.catalogName}" — not found in DB`);
      break;
    case "ERROR":
      console.error(`  [ERROR]    ${label} — ${result.errorMessage ?? "unknown error"}`);
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("DiagSync — TAT Bulk Update (Production-Safe)");
  console.log("=".repeat(70));
  console.log(`Mode             : ${DRY_RUN ? "⚠  DRY RUN — No DB writes will occur" : "🔴 LIVE — Writing to database"}`);
  console.log(`Target Org       : ${TARGET_ORG_ID ?? "ALL organisations"}`);
  console.log(`Total in catalog : ${TAT_CATALOG.length}`);
  console.log(`Timestamp        : ${new Date().toISOString()}`);
  console.log("=".repeat(70));
  console.log("");

  // ── Counters ───────────────────────────────────────────────────────────────
  let totalProcessed = 0;
  let totalUpdated   = 0;
  let totalSkipped   = 0;
  let totalMissing   = 0;
  let totalErrors    = 0;

  const missingList: string[] = [];
  const errorList:   TestResult[] = [];

  // ── Batch processing ────────────────────────────────────────────────────────
  const BATCH_SIZE = 25;

  for (let i = 0; i < TAT_CATALOG.length; i += BATCH_SIZE) {
    const batch      = TAT_CATALOG.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(TAT_CATALOG.length / BATCH_SIZE);
    const batchEnd   = Math.min(i + BATCH_SIZE, TAT_CATALOG.length);

    console.log(`── Batch ${String(batchNum).padStart(2, "0")}/${totalBatches}  (tests ${i + 1}–${batchEnd}) ${"─".repeat(35)}`);

    // Process all entries in this batch concurrently.
    // Each processEntry() is fully self-contained and never throws.
    const results = await Promise.all(
      batch.map(([name, tat]) => processEntry(name, tat))
    );

    // Log and count each result
    for (const result of results) {
      totalProcessed++;
      logResult(result);

      switch (result.status) {
        case "UPDATED": totalUpdated++;                          break;
        case "SKIPPED": totalSkipped++;                          break;
        case "MISSING": totalMissing++; missingList.push(result.catalogName); break;
        case "ERROR":   totalErrors++;  errorList.push(result);               break;
      }
    }

    console.log("");

    // Pause between batches to avoid DB connection overload
    if (i + BATCH_SIZE < TAT_CATALOG.length) {
      await delay(200);
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("SUMMARY REPORT");
  console.log("=".repeat(70));
  console.log(`Mode             : ${DRY_RUN ? "DRY RUN (no writes performed)" : "LIVE"}`);
  console.log(`Target Org       : ${TARGET_ORG_ID ?? "ALL"}`);
  console.log(`Total processed  : ${totalProcessed}`);
  console.log(`Total updated    : ${totalUpdated}${DRY_RUN ? " (simulated)" : ""}`);
  console.log(`Total skipped    : ${totalSkipped}  (value already correct)`);
  console.log(`Total missing    : ${totalMissing}  (not found in DB)`);
  console.log(`Total errors     : ${totalErrors}`);
  console.log("");

  // ── Missing tests detail ────────────────────────────────────────────────────
  if (missingList.length > 0) {
    console.log("─".repeat(70));
    console.log("MISSING TESTS — not found under any name or alias:");
    console.log("─".repeat(70));
    missingList.forEach((name, idx) => {
      console.log(`  ${String(idx + 1).padStart(3, " ")}. ${name}`);
    });
    console.log("");
    console.log("Possible causes:");
    console.log("  1. Test has not been seeded yet → run main seed first.");
    console.log("  2. DB name differs from catalog → add an alias entry.");
    console.log("  3. Test belongs to a deleted or different organisation.");
    console.log("");
  }

  // ── Error detail ────────────────────────────────────────────────────────────
  if (errorList.length > 0) {
    console.log("─".repeat(70));
    console.log("ERRORS — the following tests encountered failures:");
    console.log("─".repeat(70));
    errorList.forEach((r, idx) => {
      console.error(`  ${String(idx + 1).padStart(3, " ")}. ${r.catalogName}`);
      console.error(`       ${r.errorMessage ?? "unknown error"}`);
    });
    console.log("");
    console.log("ACTION: Investigate errors above. Re-run the script after fixing.");
    console.log("");
  }

  // ── Final status line ───────────────────────────────────────────────────────
  if (totalErrors === 0 && totalMissing === 0) {
    console.log("✅ All tests matched and processed successfully.");
  } else if (totalErrors === 0) {
    console.log("⚠  Completed with missing tests. See MISSING list above.");
  } else {
    console.log("❌ Completed with errors. See ERROR list above. Do NOT mark as done.");
  }

  if (DRY_RUN) {
    console.log("");
    console.log("ℹ  This was a DRY RUN. Set DRY_RUN = false to apply changes.");
  }

  console.log("=".repeat(70));
  console.log(`TAT update ${DRY_RUN ? "simulation" : "run"} complete. — ${new Date().toISOString()}`);
  console.log("=".repeat(70));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("");
    console.error("=".repeat(70));
    console.error("FATAL ERROR — script aborted before completing.");
    console.error(message);
    console.error("=".repeat(70));
    await prisma.$disconnect();
    process.exit(1);
  });
