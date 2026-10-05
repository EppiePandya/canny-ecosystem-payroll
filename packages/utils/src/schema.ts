import { z } from "zod";
import { defaultMonth, defaultYear } from "./date-utils";
import { isPlaceholder } from "./misx";
import { DEFAULT_PAYROLL_INVOICE_SUBJECT } from "../constant";

export { z };

export const textMinLength = 1;
export const textMaxLength = 100;

export const zString = z
  .string()
  .trim()
  .min(textMinLength)
  .max(textMaxLength)
  .regex(/^[A-Z._a-z,0-9 \s]+$/, "Only alphabets and numbers are allowed");

export const zNumberString = z
  .string()
  .trim()
  .min(textMinLength)
  .max(textMaxLength)
  .regex(
    /^[A-Z_a-z0-9 \s\-]+$/,
    "Only alphabets, numbers, and dashes are allowed",
  );

export const zNumber = z
  .string()
  .min(textMinLength)
  .max(textMaxLength)
  .regex(/^[0-9]+$/, "Only numbers are allowed");

export const zTextArea = z
  .string()
  .min(20)
  .max(textMaxLength * 5);

export const zEmail = z.string().email();
export const zEmailSuffix = z
  .string()
  .min(4)
  .max(20)
  .regex(
    /^[A-Za-z0-9]+\.[A-Za-z]{2,}$/,
    "Must contain a dot with at least one character before and two after.",
  );

export const SIZE_1KB = 1 * 1024; //1KB
export const SIZE_1MB = 1 * SIZE_1KB * SIZE_1KB; // 1MB
export const SIZE_10MB = 10 * SIZE_1MB; // 10MB

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const zImage = z
  .any()
  .refine(
    (file) => (typeof file !== "string" ? file.size < SIZE_1MB : true),
    "File size must be less than 1MB",
  )
  .refine(
    (file) =>
      typeof file !== "string"
        ? ACCEPTED_IMAGE_TYPES.includes(file?.type)
        : true,
    "Only .jpg, .jpeg, .png and .webp formats are supported.",
  );

export const zFile = z
  .any()
  .refine(
    (file) => (typeof file !== "string" ? file.size < SIZE_10MB : true),
    "File size must be less than 10MB",
  )
  .refine(
    (file) =>
      typeof file !== "string"
        ? [
          ...ACCEPTED_IMAGE_TYPES,
          "image/pdf",
          "image/doc",
          "image/docx",
          "application/pdf",
          "application/doc",
          "application/docx",
          "application/zip",
          "application/x-zip-compressed",
          "multipart/x-zip",
        ].includes(file?.type)
        : true,
    "Only .jpg, .jpeg, .png .webp, .pdf, .doc and .zip formats are supported.",
  );

export const booleanArray = ["true", "false"] as const;
export const currentDate = new Date().toISOString().split("T")[0];

export const booleanFromForm = z.preprocess((val) => {
  if (val === "on") return true;
  return false;
}, z.boolean());

// Theme
export const themes = ["light", "dark", "system"] as const;

export const ThemeFormSchema = z.object({
  theme: z.enum(themes),
});

export const company_type = [
  "project_client",
  "sub_contractor",
  "app_creator",
  "end_client",
] as const;

export const company_size = ["small", "medium", "large", "enterprise"] as const;

// Company
export const CompanySchema = z.object({
  id: z.string().optional(),
  name: zNumberString.min(3).max(50),
  email_suffix: zEmailSuffix.max(20).optional(),
  company_type: z.enum(company_type).default("project_client"),
  company_size: z.enum(company_size).default("enterprise"),
  contractor_id: z.string().uuid().nullable().optional(),
});

export const CompanyDetailsSchema = z.object({
  id: z.string().optional(),
  name: zNumberString.min(3).max(32),
  logo: z.string().optional(),
  email_suffix: zEmailSuffix.max(32).optional(),
  company_type: z.enum(company_type).optional(),
  company_size: z.enum(company_size).optional(),
  registration_number: z.string().optional(),
  primary_number: zNumber.min(10).max(10).optional(),
  secondary_number: zNumber.min(10).max(10).optional(),
  contractor_id: z.string().uuid().nullable().optional(),
});

// Company Config
export const CompanyConfigSchema = z.object({
  company_id: z.string().uuid(),
  company_bonus_start_month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .nullable(),
  company_bonus_end_month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .nullable(),
  invoice_prefix: z.string().optional().nullable(),
  company_salary_prefix: z.string().optional().nullable(),
  show_employer_contribution: z.boolean().optional().nullable(),
  created_at: z.string().optional(),
});

// Company Locations
export const LocationSchema = z.object({
  id: z.string().optional(),
  name: zString.min(3),
  is_primary: z.boolean().default(false),
  address_line_1: z
    .string()
    .min(3)
    .max(textMaxLength * 2),
  address_line_2: z
    .string()
    .max(textMaxLength * 2)
    .optional(),
  state: zString,
  city: zString.min(3),
  pincode: zNumber.min(6).max(6),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  pan_number: z.string().optional(),
  gst_number: z.string().optional(),
  company_id: z.string().optional(),
});

export const relationshipTypeArray = [
  "Manpower",
  "Payroll",
  "Placement",
] as const;

// Company Relationships
export const RelationshipSchema = z.object({
  id: z.string().optional(),
  relationship_type: z.enum(relationshipTypeArray).default("Manpower"),
  company_id: z.string(),
  is_active: z.boolean().default(false),
});

// Company Documents
export const CompanyDocumentsSchema = z.object({
  name: zString,
  document_file: zFile,
  existing_document_name: z.string().optional(),
});

// Company ESIC Details
export const CompanyEsicDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  esic_site_name: z.string().min(1),
  esic_id_number: zNumberString,
  company_id: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
});

// Project
export const statusArray = [
  "active",
  "inactive",
  "pending",
  "completed",
  "cancelled",
] as const;

export const ProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3),
  project_type: zNumberString.min(3).max(50),
  description: zTextArea.optional(),
  company_id: z.string(),
  start_date: z.string().default(currentDate),
  end_date: z.string().optional(),
  status: z.enum(statusArray).default("active"),
});

// Sites
export const SiteSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3).max(50),
  company_location_id: z.string(),
  is_active: z.boolean().default(false),
  address_line_1: z
    .string()
    .min(3)
    .max(textMaxLength * 2),
  address_line_2: z
    .string()
    .max(textMaxLength * 2)
    .optional(),
  state: zString,
  city: zString.min(3),
  pincode: zNumber.min(6).max(6),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  capacity: z.number().optional(),
  project_id: z.string().optional(),
  company_id: z.string(),
});

export const letterTypesArray = [
  "contractual_appointment_letter",
  "appointment_letter",
  "experience_letter",
  "offer_letter",
  "noc_letter",
  "relieving_letter",
  "termination_letter",
  "warning_letter",
  "contract_letter",
  "resignation_letter",
  "working_certificate",
  "increment_letter",
  "salary_certificate",
  "no_due_certificate",
] as const;

export const exitLetterTypesArray = [
  "termination_letter",
  "relieving_letter",
  "resignation_letter",
  "working_certificate",
  "salary_certificate",
] as const;

// letter
export const LetterSchema = z.object({
  id: z.string().optional(),
  include_signatuory: z.boolean().default(false),
  include_employee_signature: z.boolean().default(false),
  include_letter_header: z.boolean().default(false),
  include_letter_footer: z.boolean().default(false),
  include_salary_structure: z.boolean().default(false),
  subject: z.string().min(3).max(100),
  letter_type: z.enum(letterTypesArray).default(letterTypesArray[0]),
  letter_name: z.string().min(3).max(100),
  content: z.string().optional(),
  company_id: z.string(),
  isPdf: z.boolean().default(true),
  font_size: z.coerce.number().default(10),
});

// Pay Sequence
const daySchema = z.number().int().min(0).max(6);
export const payFrequencyArray = ["monthly"] as const;

export const PaySequenceSchema = z.object({
  name: z.string().min(3).max(20),
  overtime_multiplier: z.number().default(1.0),
  working_days: z.array(daySchema).default([1, 2, 3, 4, 5, 6]),
  pay_day: z.number().int().min(1).max(28).default(1),
  company_id: z.string(),
  is_default: z.boolean().default(false),
});

// Employees
export const genderArray = ["male", "female", "other"] as const;
export const educationArray = [
  "10th",
  "12th",
  "diploma",
  "iti",
  "graduate",
  "post_graduate",
] as const;
export const maritalStatusArray = ["married", "unmarried"] as const;

export const EmployeeSchema = z.object({
  id: z.string().optional(),
  first_name: zString.min(3),
  middle_name: zString.min(3).optional(),
  last_name: zString.min(3),
  employee_code: zNumberString.min(3),
  marital_status: z.enum(maritalStatusArray).default("unmarried"),
  date_of_birth: z.string().optional(),
  gender: z.enum(genderArray).default("male"),
  education: z.enum(educationArray).optional(),
  nationality: z.string().optional().default("Indian"),
  is_active: z.boolean().default(true),
  primary_mobile_number: zNumber.min(10).max(10).optional(),
  secondary_mobile_number: zNumber.min(10).max(10).optional(),
  personal_email: zEmail.optional(),
  company_id: z.string(),
  photo: z.string().optional(),
});

export const EmployeeStatutorySchema = z.object({
  employee_id: z.string().optional(),
  aadhaar_number: zNumber.min(12).max(12).optional(),
  pan_number: zNumberString.max(10).optional(),
  uan_number: zNumberString.max(12).optional(),
  pf_number: zNumberString.max(30).optional(),
  esic_number: zNumberString.max(30).optional(),
  is_esic_applicable: z.boolean().default(false),
  esic_id: z.preprocess(
    (val) => (val === "" ? null : val),
    z.string().uuid().nullable().optional(),
  ),
  driving_license_number: zNumberString.max(30).optional(),
  driving_license_expiry: z.string().optional(),
  passport_number: zNumberString.max(30).optional(),
  passport_expiry: z.string().optional(),
});

export const accountTypeArray = ["savings", "current", "salary"] as const;

export const EmployeeBankDetailsSchema = z.object({
  employee_id: z.string().optional(),
  account_number: zNumber.min(5).max(20),
  ifsc_code: zNumberString.min(3).max(15).optional(),
  account_holder_name: zString.min(3).optional(),
  account_type: z.enum(accountTypeArray).default("savings"),
  bank_name: zString.min(3).optional(),
  branch_name: zNumberString.min(3).optional(),
});

export const EmployeeAddressesSchema = z.object({
  id: z.string().optional(),
  employee_id: z.string().optional(),
  address_type: zString.min(3).max(20),
  is_primary: z.boolean().default(false),
  address_line_1: z
    .string()
    .min(3)
    .max(textMaxLength * 2),
  address_line_2: z
    .string()
    .max(textMaxLength * 2)
    .optional(),
  state: zString,
  city: zString.min(3),
  pincode: zNumber.min(6).max(6),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const relationshipArray = [
  "father",
  "mother",
  "spouse",
  "other",
] as const;

export const EmployeeGuardiansSchema = z.object({
  id: z.string().optional(),
  employee_id: z.string().optional(),
  relationship: z.enum(relationshipArray).optional(),
  first_name: zString.min(3).max(50).optional(),
  last_name: zString.min(3).max(50).optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(genderArray).optional(),
  is_emergency_contact: z.boolean().default(false),
  address_same_as_employee: z.boolean().default(false),
  mobile_number: zNumber.min(10).max(10).optional(),
  alternate_mobile_number: zNumber.min(10).max(10).optional(),
  email: zEmail.optional(),
});

export const positionArray = [
  "supervisor",
  "hr_manager",
  "branch_manager",
  "finance_manager",
  "jr_accountant",
  "jr_executive",
  "jr_surveyor",
  "office_clerk",
  "office_assistant",
  "office_attendant",
  "fitter",
  "assistant_fitter",
  "store_department",
  "store_incharge",
  "peon",
  "office_boy",
  "operator",
  "crusher",
  "computer_operator",
  "data_entry_operator",
  "logistics",
  "sampler",
  "helper",
  "house_keeper",
  "back_office",
  "back_office_executive",
  "biotechnologist",
  "microbiologist",
  "clerk",
  "tally_clerk",
  "surveyor",
  "cook",
  "driver",
  "chemist",
  "field_chemist",
  "field_inspector",
  "field_operator",
  "field_coordinator",
  "watchman",
  "technician",
  "inspector",
  "mechanic",
  "quality_inspector",
  "coordinator",
  "electrician",
  "welder",
  "scaffolder",
  "qac",
  "lab_chemist",
  "lab_attendant",
  "food_chemist",
  "food_coordinator",
  "lab_assistant",
  "heavy_equipment_operator",
  "plumber",
  "executive",
  "business_development_executive",
  "industry_&_environment",
  "office_attendant",
  "production_worker",
  "software_developer",
  "trainee_engineer",
  "worker",
  "labour",
  "unknown",
] as const;

export const assignmentTypeArray = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
] as const;

export const skillLevelArray = [
  "unskilled",
  "semi_skilled",
  "skilled",
] as const;

export const EmployeeWorkDetailsSchema = z.object({
  employee_id: z.string().uuid().optional(),
  site_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  position: z
    .preprocess((val) => normalizeEnum(val), z.enum(positionArray))
    .default("sampler"),
  skill_level: z
    .preprocess((val) => normalizeEnum(val), z.enum(skillLevelArray))
    .default("unskilled"),
  assignment_type: z
    .preprocess((val) => normalizeEnum(val), z.enum(assignmentTypeArray))
    .default("full_time"),
  start_date: z.string().default(currentDate),
  end_date: z.string().optional(),
  department_id: z.string().optional(),
});

export const proficiencyArray = ["beginner", "intermediate", "expert"] as const;

export const EmployeeSkillsSchema = z.object({
  id: z.string().optional(),
  employee_id: z.string().optional(),
  skill_name: zString.min(3),
  proficiency: z.enum(proficiencyArray).default("beginner"),
  years_of_experience: z.number().int().min(0).max(99).optional(),
});

export const EmployeeWorkHistorySchema = z.object({
  id: z.string().optional(),
  employee_id: z.string().optional(),
  position: z.enum(positionArray),
  company_name: zString.min(3),
  responsibilities: zTextArea.optional(),
  start_date: z.string(),
  end_date: z.string(),
});

export const employeeDocumentTypeArray = [
  "aadhaar_card",
  "pan_card",
  "address_proof",
  "bank_document",
  "birth_certificate",
  "bio_data",
  "canny_form",
  "clearance_form",
  "cv",
  "driving_license",
  "education_document",
  "election_card",
  "pan_card",
  "joining_form",
  "personal_data_form",
  "driving_license",
  "guardian_aadhaar_card",
  "guardian_bank_document",
] as const;

export const EmployeeDocumentsSchema = z.object({
  document_type: z.enum(employeeDocumentTypeArray),
  url: zFile,
});

export const deductionCycleArray = [
  "monthly",
  "yearly",
  "half_yearly",
] as const;

export const EMPLOYEE_RESTRICTED_VALUE = 15000;
export const EMPLOYER_RESTRICTED_VALUE = 15000;
export const EDLI_RESTRICTED_VALUE = 75;
export const EMPLOYEE_RESTRICTED_RATE = 0.12;
export const EMPLOYER_RESTRICTED_RATE = 0.13;

export const EmployeeProvidentFundSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  epf_number: z.string().max(20),
  deduction_cycle: z.enum(deductionCycleArray).default(deductionCycleArray[0]),
  employee_contribution: z.number().default(EMPLOYEE_RESTRICTED_RATE),
  employer_contribution: z.number().default(EMPLOYER_RESTRICTED_RATE),
  employee_restrict_value: z.number().default(EMPLOYEE_RESTRICTED_VALUE),
  employer_restrict_value: z.number().default(EMPLOYER_RESTRICTED_VALUE),
  restrict_employer_contribution: z.boolean().default(false),
  restrict_employee_contribution: z.boolean().default(false),
  edli_restrict_value: z.number().default(EDLI_RESTRICTED_VALUE),
  is_default: z.boolean().default(true),
});

export const ESI_EMPLOYEE_CONTRIBUTION = 0.0075;
export const ESI_EMPLOYER_CONTRIBUTION = 0.0325;
export const ESI_MAX_LIMIT = 21000;

export const EmployeeStateInsuranceSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  esi_number: zNumberString,
  deduction_cycle: z.enum(deductionCycleArray).default(deductionCycleArray[0]),
  employee_contribution: z.number().default(ESI_EMPLOYEE_CONTRIBUTION),
  employer_contribution: z.number().default(ESI_EMPLOYER_CONTRIBUTION),
  is_default: z.boolean().default(true),
  max_limit: z.preprocess(
    (val) => (val === "" ? null : val),
    z.coerce.number().nullable().optional(),
  ),
});

export const ProfessionalTaxSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  state: zString,
  pt_number: zNumberString.max(20),
  deduction_cycle: z.enum(deductionCycleArray).default(deductionCycleArray[0]),
  gross_salary_range: z.any().optional(),
});

export const lwfDeductionCycleArray = [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
] as const;

export const LabourWelfareFundSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  state: z.string(),
  employee_contribution: z.number().default(6),
  employer_contribution: z.number().default(12),
  deduction_cycle: z
    .enum(lwfDeductionCycleArray)
    .default(lwfDeductionCycleArray[0]),
});

export const statutoryBonusPayFrequencyArray = ["monthly", "yearly"] as const;
export const StatutoryBonusSchema = z
  .object({
    id: z.string().optional(),
    company_id: z.string(),
    name: z.string(),
    payment_frequency: z
      .enum(statutoryBonusPayFrequencyArray)
      .default(statutoryBonusPayFrequencyArray[0]),
    percentage: z.number().min(0).default(8.33),
    payout_month: z.number().optional(),
    consider_for_esic: z.boolean().default(false),
    consider_for_epf: z.boolean().default(false),
    is_default: z.boolean().default(true),
  })
  .superRefine((data) => {
    if (data.payment_frequency === "monthly") {
      if (data.payout_month !== null) {
        data.payout_month = undefined;
      }
    }
  });

export const GratuitySchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  name: z.string(),
  is_default: z.boolean().default(true),
  eligibility_years: z.number().min(0).default(4.5),
  present_day_per_year: z.number().min(1).max(365).default(240),
  payment_days_per_year: z.number().min(1).max(365).default(15),
  max_multiply_limit: z.number().min(0).default(20),
  max_amount_limit: z.number().min(0).default(3000000),
});

export const categoryArray = ["suggestion", "bug", "complain"] as const;
export const severityArray = ["low", "normal", "urgent"] as const;

export const FeedbackSchema = z.object({
  id: z.string().optional(),
  subject: zString.min(3).max(30),
  message: zTextArea.max(500),
  category: z.enum(categoryArray).default("suggestion"),
  severity: z.enum(severityArray).default("normal"),
  user_id: z.string(),
  company_id: z.string(),
});

export const UpdateUserNameSchema = z.object({
  first_name: zString.max(20),
  last_name: zString.max(20),
});
export const UpdateUserContactSchema = z.object({
  email: zEmail,
  mobile_number: zNumber.min(10).max(10),
});

export const userRoles = [
  "master",
  "admin",
  "operation_manager",
  "executive",
  "supervisor",
  "location_incharge",
] as const;

export const managementUserRoles = [
  "master",
  "admin",
  "operation_manager",
  "executive",
];

export const UserSchema = z.object({
  id: z.string().uuid().optional(),
  first_name: zString.max(20),
  last_name: zString.max(20),
  email: zEmail,
  mobile_number: zNumber.min(10).max(10).optional(),
  avatar: zImage.optional(),
  is_active: z.boolean().default(false),
  company_id: z.string(),
  role: z.enum(userRoles),
  site_id: z.string().optional(),
  location_id: z.string().optional(),
});

export const reasonForExitArray = [
  "resignation",
  "termination",
  "retirement",
  "health_reasons",
  "career_change",
  "other",
] as const;

export const pfStatusArray = ["pending", "updated"] as const;

export const paymentModeArray = ["bank", "cheque", "cash", "upi"] as const;

export const paymentStatusArray = ["pending", "paid"] as const;

export const EmployeeExitFormSchema = z.object({
  id: z.string().optional(),
  employee_id: z.string().uuid(),
  last_working_day: z.string(),
  esic_exit_date: z.string().optional().nullable(),
  note: z.string().optional(),
  exit_reason: z.enum(reasonForExitArray).default("other"),
  gratuity_document: zFile.optional(),
  service_certificate: zFile.optional(),
  experience_letter: zFile.optional(),
  relieving_letter: zFile.optional(),
  user_id: z.string().uuid().optional(),
  created_at: z.string().optional(),
});

export const deathReasonArray = [
  "natural",
  "accident",
  "illness",
  "workplace_accident",
  "suicide",
  "other",
] as const;

export const EmployeeDeathExitFormSchema = z.object({
  exit_id: z.string().uuid(),
  date_of_death: z.string().optional(),
  death_reason: z.enum(deathReasonArray).optional(),
  on_duty_esic: z.boolean().default(false),
});

export const EmployeeEpfDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  uan_number: z.string().max(12).optional(),
  pf_number: z.string().max(22).optional(),
  deduction_cycle: z.enum(lwfDeductionCycleArray).optional(),
  employee_contribution_rate: z.number().optional(),
  employer_contribution_rate: z.number().optional(),
  is_employer_contribution_included_in_ctc: z.boolean().optional(),
  is_employer_edli_contribution_included_in_ctc: z.boolean().optional(),
  is_admin_charges_included_in_ctc: z.boolean().optional(),
  is_vpf_active: z.boolean().optional(),
  vpf_percentage: z.number().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeEsiDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  esi_number: z.string().max(17).optional(),
  dispensary_name: z.string().optional(),
  deduction_cycle: z.enum(lwfDeductionCycleArray).optional(),
  employee_contribution_rate: z.number().optional(),
  employer_contribution_rate: z.number().optional(),
  include_employer_contribution_in_ctc: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeGratuityDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  previous_employment_years: z.number().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeLeaveEncashmentDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  calculation_basis: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeLwfDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  state: z.string().optional(),
  deduction_cycle: z.enum(lwfDeductionCycleArray).optional(),
  is_lwf_exempted: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeProfessionalTaxDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  pt_number: z.string().optional(),
  state: z.string().optional(),
  is_pt_exempted: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeRbDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

export const EmployeeMonthlyBonusDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  payroll_id: z.string().uuid().optional(),
  employee_salary: z.number().optional(),
  bonus_amount: z.number().optional(),
  status: z.boolean().optional(),
  created_at: z.string().optional(),
});

export const EmployeeYearlyBonusDetailsSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  payroll_id: z.string().uuid().optional(),
  employee_salary: z.number().optional(),
  bonus_amount: z.number().optional(),
  status: z.boolean().optional(),
  invoice_id: z.string().uuid().optional(),
  created_at: z.string().optional(),
});

export const PaymentTemplateVersionsSchema = z.object({
  id: z.string().uuid().optional(),
  monthly_ctc: z.number().max(10000000),
  basic_percent: z.number().max(100),
  basic_amount: z.number().max(10000000).optional(),
  calculation_direction: z.enum(["ctc_to_basic", "basic_to_ctc"]).default("ctc_to_basic"),
  is_pro_rata: booleanFromForm.default(true),
  effective_date: z.string().date(),
  template_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
});

export const PaymentTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: zNumberString.min(3).max(50),
  company_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
});

export const PaymentTemplateValuesSchema = PaymentTemplateVersionsSchema;

export const calculationTypeArray = [
  "fixed",
  "percentage_of_basic",
  "variable",
] as const;
export const fixedTypeArray = ["hour", "day", "month"] as const;
export const componentTypeArray = ["earning", "deduction"] as const;

export const HolidayConfigTypeEnum = z.enum([
  "overtime_hours",
  "paid_holidays",
  "paid_leaves",
  "casual_leaves",
]);

export type HolidayConfigType = z.infer<typeof HolidayConfigTypeEnum>;

export const HolidayConfigSchema = z
  .object({
    id: z.string().uuid().optional(),

    created_at: z.string().optional(),

    company_id: z.string().uuid(),

    type: HolidayConfigTypeEnum,

    multiplier: z.coerce.number().int().min(1).max(100).default(1),

    working_days: z.coerce.number().int().min(0).nullable().optional(),

    use_attendance_working_days: booleanFromForm.default(true),
  })
  .transform((data) => ({
    ...data,
    working_days: data.use_attendance_working_days ? null : data.working_days,
  }));

export const PaymentFieldSchemaObject = z.object({
  id: z.string().uuid().optional(),

  name: zNumberString.min(2).max(50),
  display_name: z.string(),

  calculation_type: z.enum(calculationTypeArray),

  formula: z.string().max(1000).nullable().optional(),

  is_pro_rata: booleanFromForm.default(true),
  fixed_type: z.enum(fixedTypeArray).nullable().optional(),
  is_overtime: booleanFromForm.default(false),
  consider_for_epf: booleanFromForm.default(false),
  consider_for_esic: booleanFromForm.default(true),
  consider_for_bonus: booleanFromForm.default(true),

  company_id: z.string().uuid(),

  type: z.enum(componentTypeArray),

  display_order: z.number().int().max(100).optional(),
  amount: z.number().max(10000000).optional(),
  created_at: z.string().datetime().optional(),
});

export const PaymentFieldSchema = PaymentFieldSchemaObject.refine(
  (data) => {
    if (
      data.calculation_type === "percentage_of_basic" &&
      data.amount !== undefined
    ) {
      return data.amount <= 100;
    }
    return true;
  },
  {
    message:
      "Amount must be 100 or less when calculation type is basic_percentage",
    path: ["amount"],
  },
)
  .refine(
    (data) => {
      if (data.calculation_type === "fixed" && !data.fixed_type) {
        return false;
      }
      return true;
    },
    {
      message: "fixed_type is required when calculation type is fixed",
      path: ["fixed_type"],
    },
  )
  .refine(
    (data) => {
      if (data.is_overtime && data.is_pro_rata) {
        return false;
      }
      return true;
    },
    {
      message: "Pro-rata calculation is not allowed for overtime components.",
      path: ["is_pro_rata"],
    },
  )
  .refine(
    (data) => {
      if (data.calculation_type === "variable" && !data.formula?.trim()) {
        return false;
      }
      return true;
    },
    {
      message: "Formula is required when calculation type is variable",
      path: ["formula"],
    },
  )
  .transform((data) => {
    const withFormula = {
      ...data,
      formula:
        data.calculation_type === "variable" ? data.formula ?? null : null,
    };
    if (withFormula.calculation_type !== "fixed") {
      return { ...withFormula, fixed_type: null };
    }
    if (withFormula.is_pro_rata) {
      return { ...withFormula, fixed_type: "day" as const };
    }
    return withFormula;
  });

export const PaymentTemplateComponentsSchema = z.object({
  id: z.string().uuid().optional(),

  template_version_id: z.string().uuid(),

  payment_field_id: z.string().uuid(),

  created_at: z.string().datetime().optional(),

  amount: z.number().max(10000000),
});

export const EmployeeSalaryStatutoryComponentsSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),

  employee_salary_assignment_id: z.string().uuid().optional(),

  pf_id: z.string().uuid().optional(),
  esic_id: z.string().uuid().optional(),
  pt_id: z.string().uuid().optional(),
  statutory_bonus_id: z.string().uuid().optional(),
  labour_welfare_fund_id: z.string().uuid().optional(),
});

export const PaymentStatutoryComponentsSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),

  template_version_id: z.string().uuid().optional(),

  pf_id: z.string().uuid().optional(),
  esic_id: z.string().uuid().optional(),
  pt_id: z.string().uuid().optional(),
  statutory_bonus_id: z.string().uuid().optional(),
  labour_welfare_fund_id: z.string().uuid().optional(),
});

export const PaymentTemplateUnifiedSchema = z.object({
  template: PaymentTemplateSchema.omit({
    created_at: true,
    company_id: true,
  }),
  values: PaymentTemplateVersionsSchema.omit({
    created_at: true,
    template_id: true,
  }),
  components: z
    .array(
      PaymentTemplateComponentsSchema.omit({
        template_version_id: true,
        created_at: true,
      }),
    )
    .optional(),
  statutory: PaymentStatutoryComponentsSchema.omit({
    id: true,
    created_at: true,
    template_version_id: true,
  }).optional(),
});

export const EmployeeSalaryAssignmentSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  monthly_ctc: z.number().max(10000000),
  basic_percent: z.number().max(100),
  basic_amount: z.number().max(10000000).optional(),
  is_pro_rata: booleanFromForm.default(true),
  effective_date: z.string().date().optional(),
  employee_id: z.string().uuid(),
  use_payment_template: booleanFromForm,
  template_id: z.string().uuid().optional(),
  calculation_direction: z.string().optional(),
  basic_formula: z.string().optional().nullable(),
});

export const EmployeeSalaryComponentsSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  employee_salary_assignment_id: z.string().uuid(),
  amount: z.number().max(10000000),
  payment_field_id: z.string().uuid(),
});

export const EmployeeSalaryUnifiedSchema = z.object({
  assignment: EmployeeSalaryAssignmentSchema.omit({
    created_at: true,
  }),
  components: z
    .array(
      EmployeeSalaryComponentsSchema.omit({
        employee_salary_assignment_id: true,
        created_at: true,
      }),
    )
    .optional(),
  statutory: EmployeeSalaryStatutoryComponentsSchema.omit({
    id: true,
    created_at: true,
    employee_salary_assignment_id: true,
  }).optional(),
});

export const statutoryFieldsArray = [
  "epf",
  "esi",
  "bonus",
  "pt",
  "lwf",
] as const;

// Payment Template Assignment
export const paymentAssignmentTypesArray = ["employee", "site"] as const;
export const eligibilityOptionsArray = ["position", "skill_level"] as const;

// Payment Template Assignment
export const EmployeeLinkSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  effective_from: z.string().default(currentDate),
  effective_to: z.string().optional(),
  template_id: z.string(),
  employee_id: z.string(),
  assignment_type: z.enum(paymentAssignmentTypesArray).default("employee"),
});

export const PaymentTemplateFormSiteDialogSchema = z.object({
  name: z.string(),
  effective_from: z.string().default(currentDate),
  effective_to: z.string().optional(),
  template_id: z.string(),
  eligibility_option: z.enum(eligibilityOptionsArray).optional(),
  position: z.string().optional(),
  skill_level: z.string().optional(),
});

export const DeleteEmployeeLinkSchema = z.object({
  is_active: z.enum(booleanArray).transform((val) => val === "true"),
});

export const SiteLinkSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  effective_from: z.string().default(currentDate),
  effective_to: z.string().optional(),
  template_id: z.string(),
  eligibility_option: z.enum(eligibilityOptionsArray).optional(),
  position: z.string().optional(),
  skill_level: z.string().optional(),
  assignment_type: z.enum(paymentAssignmentTypesArray).default("site"),
  site_id: z.string(),
});

export const reimbursementStatusArray = ["approved", "pending"] as const;

export const reimbursementTypeArray = [
  "expenses",
  "advances",
  "loan",
  "rent",
  "bonus",
  "vehicle",
  "vehicle_related",
  "others",
] as const;

export const ReimbursementSchema = z.object({
  id: z.string().optional(),
  submitted_date: z.string().default(currentDate),
  status: z.enum(reimbursementStatusArray).default("approved"),
  amount: z.number().min(1).max(100000000),
  user_id: z.string().optional(),
  employee_id: z.string().optional(),
  payee_id: z.string().optional(),
  company_id: z.string(),
  type: z.enum(reimbursementTypeArray).default("expenses"),
  note: z.string().optional(),
});

export const ImportReimbursementHeaderSchema = z.object({
  submitted_date: z.string().optional(),
  employee_code: z.string().optional(),
  name: z.string().optional(),
  amount: z.string(),
  email: z.string().optional(),
  status: z.string().optional(),
});

export const ImportSingleReimbursementDataSchema = z.object({
  submitted_date: z.string(),
  employee_code: zNumberString.optional(),
  name: z.string().optional(),
  amount: z.preprocess(
    (value) => (typeof value === "string" ? Number.parseFloat(value) : value),
    z.number(),
  ),
  email: zEmail.optional(),
  status: z.enum(reimbursementStatusArray),
});

export const ImportReimbursementDataSchema = z.object({
  data: z.array(ImportSingleReimbursementDataSchema),
});

export const duplicationTypeArray = ["skip", "overwrite"] as const;

export const ImportEmployeeDetailsHeaderSchemaObject = z.object({
  department: z.string().optional(),
  first_name: z.string().optional(),
  middle_name: z.string().optional(),
  last_name: z.string().optional(),
  gender: z.string().optional(),
  education: z.string().optional(),
  marital_status: z.string().optional(),
  nationality: z.string().optional(),
  is_active: z.string().optional(),
  date_of_birth: z.string().optional(),
  personal_email: z.string().optional(),
  primary_mobile_number: z.string().optional(),
  secondary_mobile_number: z.string().optional(),
  position: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  assignment_type: z.string().optional(),
  skill_level: z.string().optional(),
  employee_code: z.string().optional(),
  full_name: z.string().optional(),
  full_address: z.string().optional(),
  guardian_full_name: z.string().optional(),
  photo: z.string().optional(),
});

export const ImportEmployeeDetailsHeaderSchema =
  ImportEmployeeDetailsHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.first_name,
        data.middle_name,
        data.last_name,
        data.gender,
        data.education,
        data.marital_status,
        data.nationality,
        data.is_active,
        data.date_of_birth,
        data.personal_email,
        data.primary_mobile_number,
        data.secondary_mobile_number,
        data.department,
        data.assignment_type,
        data.position,
        data.start_date,
        data.end_date,
        data.skill_level,
        data.photo,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "first_name",
        "middle_name",
        "last_name",
        "gender",
        "education",
        "marital_status",
        "is_active",
        "date_of_birth",
        "personal_email",
        "primary_mobile_number",
        "secondary_mobile_number",
        "department",
        "assignment_type",
        "position",
        "skill_level",
        "start_date",
        "end_date",
        "nationality",
        "photo",
      ],
    },
  );

export const normalizeEnum = (value: unknown): unknown => {
  if (typeof value === "string") {
    let normalized = value
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/\./g, "")
      .trim();

    // Marital Status
    if (normalized === "single") return "unmarried";

    // Assignment Type
    if (normalized === "permanent") return "full_time";

    // Designation / Position Mappings
    const deoDesignations = [
      "deo",
      "d_e_o",
      "data_entry",
      "data_entry_operator",
    ];
    if (deoDesignations.includes(normalized)) return "data_entry_operator";

    const traineeEngineerDesignations = [
      "trainee_engineer",
      "trainee_engg",
      "trainee_eng",
      "tr_engineer",
      "tr_engg",
      "traineeengineer",
      "trainee_engineering",
    ];
    if (traineeEngineerDesignations.includes(normalized)) return "trainee_engineer";

    // Education Mappings
    const itiDegrees = [
      "iti",
      "i_t_i",
      "industrial_training_institute",
      "industrial_training_inst",
    ];
    if (itiDegrees.includes(normalized)) return "iti";

    const postGraduateDegrees = [
      "mba",
      "mca",
      "mtech",
      "me",
      "ma",
      "msc",
      "mcom",
      "med",
      "llm",
      "pg",
      "postgraduate",
      "post_graduate",
      "masters",
      "master",
    ];
    if (postGraduateDegrees.includes(normalized)) return "post_graduate";

    const graduateDegrees = [
      "bba",
      "bca",
      "btech",
      "be",
      "ba",
      "bsc",
      "bcom",
      "bed",
      "llb",
      "mbbs",
      "graduate",
      "bachelor",
      "bachelors",
    ];
    if (graduateDegrees.includes(normalized)) return "graduate";

    return normalized;
  }
  return value;
};

export const normalizeBoolean = (value: unknown): unknown => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "active" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "1"
    ) {
      return true;
    }
    if (
      normalized === "inactive" ||
      normalized === "false" ||
      normalized === "no" ||
      normalized === "n" ||
      normalized === "0"
    ) {
      return false;
    }
  }
  if (typeof value === "boolean") return value;
  return undefined;
};

export const formatExcelDate = (d: Date) => {
  const corrected = new Date(
    d.getTime() + Math.abs(d.getTimezoneOffset() * 60000),
  );

  const year = corrected.getFullYear();
  const month = String(corrected.getMonth() + 1).padStart(2, "0");
  const day = String(corrected.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const normalizeDate = (value: unknown): unknown => {
  if (!value) return undefined;

  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateUTC = (d: Date) => {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return undefined;
    return formatDate(value);
  }

  const strValue = String(value).trim();
  if (!strValue) return undefined;

  const numValue = Number(strValue);
  if (!isNaN(numValue) && numValue > 20000) {
    const date = new Date((numValue - 25569) * 86400 * 1000);
    return formatDateUTC(date);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) return strValue;

  let parsedDate = new Date(strValue);
  if (!isNaN(parsedDate.getTime())) {
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(strValue)) {
      return formatDateUTC(parsedDate);
    }
    return formatDate(parsedDate);
  }

  const parts = strValue.split(/[-/.]/);
  if (parts.length === 3) {
    let day, month, year;
    if (parts[2].length === 4) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    } else if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }

    if (year && month !== undefined && day) {
      const d = new Date(year, month, day);
      if (!isValidDate(d)) return strValue;
      return formatDate(d);
    }
  }

  return strValue;
};

const isValidDate = (d: Date) => d instanceof Date && !isNaN(d.getTime());

export const ImportSingleEmployeeDetailsDataSchema = z.object({
  first_name: zString.min(1),
  middle_name: zString.optional().catch(undefined),
  last_name: zString.optional().catch(undefined),
  employee_code: zNumberString.min(3).optional().catch(undefined),
  marital_status: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(maritalStatusArray).catch("unmarried"),
  ),
  date_of_birth: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  gender: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(genderArray).catch("male"),
  ),
  education: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(educationArray).optional().catch(undefined),
  ),
  nationality: z.string().optional().catch("Indian"),
  is_active: z.preprocess(
    (val) => normalizeBoolean(val),
    z.boolean().catch(true),
  ),
  primary_mobile_number: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number().optional().catch(undefined)),
  secondary_mobile_number: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number().optional().catch(undefined)),
  personal_email: zEmail.optional().catch(undefined),
  site_id: z.string().optional().catch(undefined),
  project_id: z.string().optional().catch(undefined),
  department_id: z.string().optional().catch(undefined),
  department: z.string().min(1).optional().catch(undefined),
  position: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(positionArray).catch("sampler"),
  ),
  skill_level: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(skillLevelArray).catch("unskilled"),
  ),
  assignment_type: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(assignmentTypeArray).catch("full_time"),
  ),
  start_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  end_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  photo: z.string().optional().catch(undefined),
});

export const ImportEmployeeDetailsDataSchema = z.object({
  data: z.array(ImportSingleEmployeeDetailsDataSchema),
});

export const ImportEmployeeWorkDetailsHeaderSchemaObject = z.object({
  employee_code: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  assignment_type: z.string().optional(),
  skill_level: z.string().optional(),
  site: z.string().optional(),
  project: z.string().optional(),
});

export const ImportEmployeeWorkDetailsHeaderSchema =
  ImportEmployeeWorkDetailsHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.department,
        data.position,
        data.start_date,
        data.end_date,
        data.assignment_type,
        data.skill_level,
        data.site,
        data.project,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "department",
        "position",
        "start_date",
        "end_date",
        "assignment_type",
        "skill_level",
        "site",
        "project",
      ],
    },
  );

export const ImportSingleEmployeeWorkDetailsDataSchema = z.object({
  employee_code: zNumberString.min(3),
  department: z.string().optional().catch(undefined),
  position: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(positionArray).catch("sampler"),
  ),
  skill_level: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(skillLevelArray).catch("unskilled"),
  ),
  assignment_type: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(assignmentTypeArray).catch("full_time"),
  ),
  start_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().catch(currentDate),
  ),
  end_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  site: z.string().optional().catch(undefined),
  project: z.string().optional().catch(undefined),
});

export const ImportEmployeeWorkDetailsDataSchema = z.object({
  data: z.array(ImportSingleEmployeeWorkDetailsDataSchema),
});

export const ImportEmployeeLoansHeaderSchemaObject = z.object({
  employee_code: z.string().optional(),
  loan_name: z.string().optional(),
  amount: z.string().optional(),
  monthly_installment: z.string().optional(),
  loan_date: z.string().optional(),
  number_of_months: z.string().optional(),
});

export const ImportEmployeeLoansHeaderSchema =
  ImportEmployeeLoansHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.loan_name,
        data.amount,
        data.monthly_installment,
        data.loan_date,
        data.number_of_months,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "loan_name",
        "amount",
        "monthly_installment",
        "loan_date",
        "number_of_months",
      ],
    },
  );

export const ImportSingleEmployeeLoansDataSchema = z.object({
  employee_code: zNumberString.min(3),
  loan_name: z.string().min(1),
  amount: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
  monthly_installment: z.preprocess(
    (val) => Number(val) || 0,
    z.number().min(0),
  ),
  loan_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().catch(currentDate),
  ),
  number_of_months: z.preprocess(
    (val) => Number(val) || 1,
    z.number().min(1).optional(),
  ),
});

export const ImportEmployeeLoansDataSchema = z.object({
  data: z.array(ImportSingleEmployeeLoansDataSchema),
});

export const ImportEmployeeStatutoryHeaderSchemaObject = z.object({
  employee_code: z.string(),
  aadhaar_number: z.string().optional(),
  pan_number: z.string().optional(),
  uan_number: z.string().optional(),
  pf_number: z.string().optional(),
  esic_number: z.string().optional(),
  esic_site_name: z.string().optional(),
  driving_license_number: z.string().optional(),
  driving_license_expiry: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry: z.string().optional(),
});

export const ImportEmployeeStatutoryHeaderSchema =
  ImportEmployeeStatutoryHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.aadhaar_number,
        data.pan_number,
        data.uan_number,
        data.pf_number,
        data.esic_number,
        data.esic_site_name,
        data.driving_license_number,
        data.driving_license_expiry,
        data.passport_number,
        data.passport_expiry,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "aadhaar_number",
        "pan_number",
        "uan_number",
        "pf_number",
        "esic_number",
        "esic_site_name",
        "driving_license_number",
        "driving_license_expiry",
        "passport_number",
        "passport_expiry",
      ],
    },
  );

export const ImportSingleEmployeeStatutoryDataSchema = z.object({
  employee_code: zNumberString.min(3),
  aadhaar_number: zNumber.min(12).max(12).optional(),
  pan_number: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(10).optional(),
  ),
  uan_number: zNumberString.max(12).optional(),
  pf_number: zNumberString.max(22).optional(),
  esic_number: zNumberString.max(20).optional(),
  esic_site_name: z.string().optional(),
  esic_id: z.string().optional(),
  is_esic_applicable: z.boolean().optional(),
  driving_license_number: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(20).optional(),
  ),
  driving_license_expiry: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  passport_number: zNumberString.max(20).optional(),
  passport_expiry: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
});

export const ImportEmployeeStatutoryDataSchema = z.object({
  data: z.array(ImportSingleEmployeeStatutoryDataSchema),
});

export const ImportEmployeeBankDetailsHeaderSchemaObject = z.object({
  employee_code: z.string(),
  account_holder_name: z.string().optional(),
  account_number: z.string(),
  ifsc_code: z.string().optional(),
  account_type: z.string().optional(),
  bank_name: z.string().optional(),
  branch_name: z.string().optional(),
});

export const ImportEmployeeBankDetailsHeaderSchema =
  ImportEmployeeBankDetailsHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.account_holder_name,
        data.account_number,
        data.ifsc_code,
        data.account_type,
        data.bank_name,
        data.branch_name,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "account_holder_name",
        "account_number",
        "ifsc_code",
        "account_type",
        "bank_name",
        "branch_name",
      ],
    },
  );

export const ImportSingleEmployeeBankDetailsDataSchema = z.object({
  employee_code: zNumberString.min(3),
  account_number: zNumber.min(5).max(20),
  ifsc_code: z.preprocess(
    (val) => (isPlaceholder(val) ? undefined : String(val).trim()),
    zNumberString.min(3).max(15).optional(),
  ),
  account_holder_name: zString.min(3).optional(),
  account_type: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(accountTypeArray).catch("savings"),
  ),
  bank_name: z.string().min(3).optional().catch(undefined),
  branch_name: z.string().min(3).optional(),
});

export const ImportEmployeeBankDetailsDataSchema = z.object({
  data: z.array(ImportSingleEmployeeBankDetailsDataSchema),
});

export const ImportEmployeeAddressHeaderSchemaObject = z.object({
  employee_code: z.string(),
  address_type: z.string(),
  address_line_1: z.string(),
  address_line_2: z.string().optional(),
  city: z.string(),
  pincode: z.string(),
  state: z.string(),
  country: z.string(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  is_primary: z.string().optional(),
});

export const ImportEmployeeAddressHeaderSchema =
  ImportEmployeeAddressHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.address_type,
        data.address_line_1,
        data.address_line_2,
        data.city,
        data.pincode,
        data.state,
        data.country,
        data.latitude,
        data.longitude,
        data.is_primary,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "address_type",
        "address_line_1",
        "address_line_2",
        "city",
        "pincode",
        "state",
        "country",
        "latitude",
        "longitude",
        "is_primary",
      ],
    },
  );

export const ImportSingleEmployeeAddressDataSchema = z.object({
  employee_code: zNumberString.min(3),
  address_type: zString.min(3).max(20).optional(),
  is_primary: z.preprocess(
    (val) => normalizeBoolean(val),
    z.boolean().default(false),
  ),
  address_line_1: z
    .string()
    .min(3)
    .max(textMaxLength * 2)
    .optional(),
  address_line_2: z
    .string()
    .max(textMaxLength * 2)
    .optional(),
  state: zString.optional(),
  city: zString.min(3).optional(),
  pincode: zNumber.min(6).max(6).optional(),
  latitude: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(180).min(-180).optional(),
  ),
  longitude: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(180).min(-180).optional(),
  ),
});

export const ImportEmployeeAddressDataSchema = z.object({
  data: z.array(ImportSingleEmployeeAddressDataSchema),
});

export const ImportEmployeeGuardiansHeaderSchemaObject = z.object({
  employee_code: z.string().optional(),
  relationship: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  mobile_number: z.string().optional(),
  alternate_mobile_number: z.string().optional(),
  email: z.string().optional(),
  is_emergency_contact: z.string().optional(),
  address_same_as_employee: z.string().optional(),
});
export const ImportEmployeeGuardiansHeaderSchema =
  ImportEmployeeGuardiansHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.relationship,
        data.first_name,
        data.last_name,
        data.date_of_birth,
        data.gender,
        data.mobile_number,
        data.alternate_mobile_number,
        data.email,
        data.is_emergency_contact,
        data.address_same_as_employee,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "relationship",
        "first_name",
        "last_name",
        "date_of_birth",
        "gender",
        "mobile_number",
        "alternate_mobile_number",
        "email",
        "is_emergency_contact",
        "address_same_as_employee",
      ],
    },
  );

export const ImportSingleEmployeeGuardiansDataSchema = z.object({
  employee_code: zNumberString.min(3),
  relationship: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(relationshipArray).optional().catch(undefined),
  ),
  first_name: zString.min(3).max(50).optional(),
  last_name: zString.min(3).max(50).optional(),
  date_of_birth: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  gender: z.preprocess(
    (val) => normalizeEnum(val),
    z.enum(genderArray).optional().catch(undefined),
  ),
  is_emergency_contact: z.preprocess(
    (val) => normalizeBoolean(val),
    z.boolean().default(false),
  ),
  address_same_as_employee: z.preprocess(
    (val) => normalizeBoolean(val),
    z.boolean().default(false),
  ),
  mobile_number: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(10).min(10).optional(),
  ),
  alternate_mobile_number: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(10).min(10).optional(),
  ),
  email: zEmail.optional(),
});

export const ImportEmployeeGuardiansDataSchema = z.object({
  data: z.array(ImportSingleEmployeeGuardiansDataSchema),
});

export const payrollPaymentStatusArray = [
  "pending",
  "submitted",
  "approved",
] as const;

export const PayrollSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  status: z.enum(payrollPaymentStatusArray).default("pending"),
  run_date: z.string().default(currentDate),
  total_net_amount: z.number().default(0),
  company_id: z.string(),
  total_employees: z.number().default(0),
  project_id: z.string().optional(),
  site_id: z.string().optional(),
  month: z.number().min(1).max(12).default(defaultMonth),
  year: z.number().default(defaultYear),
});

// Payroll
export const SalaryEntrySchema = z.object({
  salaryFieldValues_id: z.string().optional(),
  payrollFields_id: z.string().optional(),
  payroll_id: z.string().optional(),
  monthly_attendance_id: z.string().optional(),
  salary_entries_id: z.string().optional(),
  name: z.string(),
  type: z.enum(componentTypeArray).default("earning"),
  amount: z.number(),
  is_monthly_ctc: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});

export const SalaryEntrySiteDepartmentSchema = z.object({
  id: z.string().optional(),
  site_id: z.string().optional(),
  department_id: z.string().optional(),
});

export const ImportExitHeaderSchemaObject = z.object({
  employee_code: z.string(),
  last_working_day: z.string(),
  exit_reason: z.string(),
  note: z.string(),
  esic_exit_date: z.string().optional(),
});

export const ImportExitHeaderSchema = ImportExitHeaderSchemaObject.refine(
  (data) => {
    const values = [
      data.employee_code,
      data.last_working_day,
      data.exit_reason,
      data.note,
      data.esic_exit_date,
    ].filter(Boolean);

    const uniqueValues = new Set(values);
    return uniqueValues.size === values.length;
  },
  {
    message:
      "Some fields have the same value. Please select different options.",
    path: [
      "employee_code",
      "last_working_day",
      "exit_reason",
      "note",
      "esic_exit_date",
    ],
  },
);

export const ImportSingleExitDataSchema = z.object({
  employee_code: z.string(),
  last_working_day: z.string(),
  esic_exit_date: z.preprocess(
    (val) => normalizeDate(val),
    z.string().optional().catch(undefined),
  ),
  exit_reason: z.enum(reasonForExitArray).default("other"),
  note: z.string().optional(),
});

export const ImportExitDataSchema = z.object({
  data: z.array(ImportSingleExitDataSchema),
});

export const attendanceWorkShiftArray = [
  "morning",
  "afternoon",
  "night",
] as const;
export const attendanceHolidayTypeArray = [
  "weekly",
  "paid",
  "state",
  "national",
] as const;

export const AttendanceSchema = z.object({
  id: z.string().optional(),
  employee_id: z.string(),
  month: z.number().min(1).max(12).default(defaultMonth),
  year: z.number().default(defaultYear),
  working_days: z.number().min(0).max(31).default(26),
  present_days: z.number().min(0).max(31).default(26),
  overtime_hours: z.number().default(0),
  absent_days: z.number().min(0).max(31).optional(),
  paid_holidays: z.number().min(0).max(31).optional(),
  paid_leaves: z.number().min(0).max(31).optional(),
  casual_leaves: z.number().min(0).max(31).optional(),
});

export const ImportEmployeeAttendanceHeaderSchemaObject = z.object({
  employee_code: z.string(),
  working_days: z.string(),
  present_days: z.string(),
  overtime_hours: z.string(),
  absent_days: z.string(),
  paid_holidays: z.string(),
  paid_leaves: z.string(),
  casual_leaves: z.string(),
});

export const ImportEmployeeAttendanceHeaderSchema =
  ImportEmployeeAttendanceHeaderSchemaObject.refine(
    (data) => {
      const values = [
        data.employee_code,
        data.working_days,
        data.present_days,
        data.overtime_hours,
        data.absent_days,
        data.paid_holidays,
        data.paid_leaves,
        data.casual_leaves,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "present_days",
        "working_days",
        "overtime_hours",
        "absent_days",
        "paid_holidays",
        "paid_leaves",
        "casual_leaves",
      ],
    },
  );

export const AttendanceDataSchema = z.object({
  date: z.string(),
  no_of_hours: z.number().min(0).max(24).default(8),
  attendance_id: z.string(),
  present: z.boolean().default(false),
  holiday: z.boolean().default(false),
  working_shift: z.enum(attendanceWorkShiftArray).optional(),
  holiday_type: z.enum(attendanceHolidayTypeArray).optional(),
});

export const ImportSingleEmployeeAttendanceDataSchema = z.object({
  employee_code: zNumberString.min(3),
  working_days: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number()),
  overtime_hours: z
    .preprocess((value) => {
      const parsed =
        typeof value === "string" ? Number.parseFloat(value) : value;
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number())
    .optional(),
  absent_days: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number()),
  paid_holidays: z
    .preprocess((value) => {
      const parsed =
        typeof value === "string" ? Number.parseFloat(value) : value;
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number())
    .optional(),
  paid_leaves: z
    .preprocess((value) => {
      const parsed =
        typeof value === "string" ? Number.parseFloat(value) : value;
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number())
    .optional(),
  casual_leaves: z
    .preprocess((value) => {
      const parsed =
        typeof value === "string" ? Number.parseFloat(value) : value;
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number())
    .optional(),
  present_days: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number()),
});

export const ImportEmployeeAttendanceDataSchema = z.object({
  data: z.array(ImportSingleEmployeeAttendanceDataSchema),
});

export const encashmentFreqArray = ["yearly", "one time"] as const;

export const LeaveEncashmentSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  name: z.string(),
  eligible_years: z.number().min(0).default(0),
  max_encashable_leaves: z.number().min(0).max(365).default(0),
  max_encashment_amount: z.number().min(0).default(0),
  encashment_multiplier: z.number().positive().default(1),
  working_days_per_year: z.number().min(1).max(365).default(260),
  encashment_frequency: z
    .enum(encashmentFreqArray)
    .default(encashmentFreqArray[0]),
  is_default: z.boolean().default(true),
});

export const locationTypeArray = ["onsite", "others"] as const;
export const severityTypeArray = [
  "minor",
  "moderate",
  "severe",
  "critical",
  "fatal",
  "unknown",
] as const;

export const categoryOfIncidentArray = [
  "theft",
  "assault",
  "fall",
  "accident",
  "machinery",
  "chemical_spill",
  "fire_incident",
  "electrical_hazard",
  "gas_leak",
  "equipment_misuse",
  "verbal_abuse",
  "physical_altercation",
  "misconduct",
  "harassment",
  "intoxication_on_duty",
  "negligence",
  "slip_or_trip",
  "vehicle_collision",
  "object_fall",
  "crushed_between_objects",
  "no_safety_gear",
  "violation_of_SOP",
  "weather_related_injury",
  "others",
] as const;

export const IncidentSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  vehicle_id: z.string().optional(),
  employee_id: z.string().optional(),
  date: z.string().default(currentDate),
  title: zString.min(3).max(30),
  location_type: z.enum(locationTypeArray).default("onsite"),
  location: z.string().optional(),
  category: z.enum(categoryOfIncidentArray).default("accident"),
  severity: z.enum(severityTypeArray).default("moderate"),
  status: z.enum(statusArray).default("active"),
  description: zTextArea.max(500),
  diagnosis: zTextArea.max(500).optional(),
  action_taken: zTextArea.max(500).optional(),
});

export const leaveTypeArray = [
  "casual_leave",
  "paid_leave",
  "unpaid_leave",
  "sick_leave",
  "paternity_leave",
] as const;

export const LeaveSchema = z.object({
  employee_id: z.string(),
  start_date: z.string(),
  end_date: z.string().optional(),
  reason: z.string().max(100).min(3),
  leave_type: z.enum(leaveTypeArray),
  user_id: z.string().optional(),
});

export const LeaveTypeSchema = z.object({
  company_id: z.string(),
  leaves_per_year: z.number().max(365),
  leave_type: z.enum(leaveTypeArray),
});

export const HolidaysSchema = z.object({
  company_id: z.string(),
  name: z.string().max(20),
  start_date: z.string().default(currentDate),
  no_of_days: z.number().min(1).max(365),
  is_mandatory: z.boolean().optional().default(false),
});

export const caseTypeArray = [
  "dispute",
  "wage_issue",
  "injury",
  "misconduct",
  "legal",
  "contract_violation",
] as const;
export const caseStatusArray = ["open", "resolved", "closed"] as const;
export const reportedByArray = [
  "employee",
  "site",
  "project",
  "company",
  "canny",
  "other",
] as const;
export const reportedOnArray = [
  "employee",
  "site",
  "project",
  "company",
  "canny",
  "other",
] as const;
export const caseLocationTypeArray = ["employee", "site", "other"] as const;

export const CaseSchema = z.object({
  id: z.string().optional(),
  company_id: z.string(),
  date: z.string().default(currentDate),
  title: z.string().min(1, "Title is required"),
  case_type: z.enum(caseTypeArray).default("dispute"),
  status: z.enum(caseStatusArray).default("open"),
  incident_date: z.string().optional(),
  reported_by: z.enum(reportedByArray).default("employee"),
  reported_on: z.enum(reportedOnArray).default("employee"),
  location: z.string().optional(),
  location_type: z.enum(caseLocationTypeArray).default("employee"),
  amount_given: z.number().optional(),
  amount_received: z.number().optional(),
  court_case_reference: z.string().optional(),
  description: zTextArea.optional(),
  document: zFile.optional(),
  resolution_date: z.string().optional(),
  reported_on_employee_id: z.string().optional(),
  reported_on_project_id: z.string().optional(),
  reported_on_site_id: z.string().optional(),
  reported_on_company_id: z.string().optional(),
  reported_by_company_id: z.string().optional(),
  reported_by_employee_id: z.string().optional(),
  reported_by_project_id: z.string().optional(),
  reported_by_site_id: z.string().optional(),
});

export const ImportLeavesHeaderSchema = z
  .object({
    employee_code: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    reason: z.string(),
    leave_type: z.string(),
    email: z.string().optional(),
  })
  .refine(
    (data) => {
      const values = [
        data.employee_code,
        data.start_date,
        data.end_date,
        data.reason,
        data.leave_type,
        data.email,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "employee_code",
        "start_date",
        "end_date",
        "reason",
        "leave_type",
        "email",
      ],
    },
  );

export const ImportSingleLeavesDataSchema = z.object({
  employee_code: zNumberString,
  start_date: z.string(),
  end_date: z.string().optional(),
  reason: z.string().max(100).min(3),
  leave_type: z.enum(leaveTypeArray),
  email: zEmail.optional(),
});

export const ImportLeavesDataSchema = z.object({
  data: z.array(ImportSingleLeavesDataSchema),
});

export const ImportReimbursementPayrollHeaderSchemaObject = z.object({
  employee_code: z.string(),
  amount: z.string(),
});

export const ImportReimbursementPayrollHeaderSchema =
  ImportReimbursementPayrollHeaderSchemaObject.refine(
    (data) => {
      const values = [data.employee_code, data.amount].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: ["employee_code", "amount"],
    },
  );

export const ImportSingleReimbursementPayrollDataSchema = z.object({
  employee_code: zNumberString.min(3),
  amount: z.preprocess((value) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number()),
});

export const ImportReimbursementPayrollDataSchema = z.object({
  title: z.string().min(3),
  data: z.array(ImportSingleReimbursementPayrollDataSchema),
});

export const ImportExitPayrollHeaderSchemaObject = z.object({
  employee_code: z.string(),
});

export const ImportExitPayrollHeaderSchema =
  ImportExitPayrollHeaderSchemaObject.refine(
    (data) => {
      const values = [data.employee_code].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: ["employee_code"],
    },
  );

export const ImportSingleExitPayrollDataSchema = z.object({
  employee_code: zNumberString.min(3),
});

export const ImportExitPayrollDataSchema = z.object({
  title: z.string().min(3),
  data: z.array(ImportSingleExitPayrollDataSchema),
});

export const ImportSalaryPayrollHeaderSchemaObject = z.object({
  employee_code: z.string(),
  present_days: z.string(),
});

export const ImportSalaryPayrollHeaderSchema =
  ImportSalaryPayrollHeaderSchemaObject.refine(
    (data) => {
      const values = [data.employee_code, data.present_days].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: ["employee_code", "present_days"],
    },
  );

export const ImportSingleSalaryPayrollDataSchema = z.object({
  employee_code: zNumberString.min(3),
  present_days: z.preprocess((value) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return 0;
    }
    const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
    return Number.isNaN(parsed) ? 0 : parsed;
  }, z.number().min(0, "Present days cannot be negative")),
});

export const ImportSalaryPayrollDataSchema = z.object({
  title: z.string().min(3).optional(),
  data: z.array(ImportSingleSalaryPayrollDataSchema),
});

export const EmployeeLoginSchema = z.object({
  identifier: z.string().optional(),
});

export const InvoiceSchema = z
  .object({
    id: z.string().optional(),
    company_id: z.string(),
    invoice_number: z.string(),
    date: z.string().default(currentDate),
    subject: z
      .string()
      .default(DEFAULT_PAYROLL_INVOICE_SUBJECT),
    company_address_id: z.string(),
    type: z.enum(["salary", "exit", "reimbursement"]),
    payroll_data: z.any(),
    include_charge: booleanFromForm.default(false),
    include_cgst: booleanFromForm.default(false),
    include_sgst: booleanFromForm.default(false),
    include_igst: booleanFromForm.default(false),
    charge_amount: z.coerce.number().default(0),
    proof: zFile.optional(),
    is_paid: booleanFromForm.default(false),
    paid_date: z.string().optional(),
    include_header: booleanFromForm.default(false),
    include_sign_stamp: booleanFromForm.default(false),
    user_id: z.string().optional(),
    additional_text: z.preprocess(
      (val) => (val === "" || val === undefined ? null : val),
      z.string().nullable().optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.is_paid && !data.paid_date) {
      ctx.addIssue({
        path: ["paid_date"],
        message: "Paid date is required when invoice is marked as paid",
        code: z.ZodIssueCode.custom,
      });
    }
  });

export const DepartmentsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(3),
  site_id: z.string().optional(),
  company_id: z.string(),
});

export const EmployeeLoanSchema = z
  .object({
    id: z.string().uuid().optional(),
    employee_id: z.string().uuid(),
    loan_name: z.string().min(3),
    amount: z.preprocess(
      (value) => (typeof value === "string" ? Number.parseFloat(value) : value),
      z.number().min(0),
    ),
    number_of_months: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value === ""
            ? undefined
            : Number.parseFloat(value)
          : value,
      z.number().int("No float values allowed").min(1).optional(),
    ),
    monthly_installment: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value === ""
            ? undefined
            : Number.parseFloat(value)
          : value,
      z.number().min(0).optional(),
    ),
    reimbursement_id: z.string().uuid().optional(),
    is_paid: z.boolean().optional().default(false),
    loan_date: z.string().optional(),
  })
  .refine(
    (data) => {
      if (
        data.monthly_installment !== undefined &&
        data.monthly_installment > data.amount
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Monthly installment cannot be more than the loan amount",
      path: ["monthly_installment"],
    },
  );

export const PayeeSchema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string(),
  name: zString.max(20),
  account_number: zNumber.min(5).max(20),
  ifsc_code: zNumberString.min(3).max(15),
  account_holder_name: zString.min(3),
  account_type: z.enum(accountTypeArray).default("savings"),
  bank_name: zString.min(3),
  branch_name: zNumberString.min(3),
  aadhaar_number: zNumber.min(12).max(12).optional(),
  pan_number: zNumberString.max(10).optional(),
  fixed_amount: z.number().optional(),
  type: z.enum(reimbursementTypeArray).default("rent"),
});

export const vehicleOwnershipArray = ["self", "payee"] as const;
export const vehicleTypeArray = [
  "passenger",
  "goods",
  "agricultural",
  "military",
  "electric",
  "off_road",
] as const;

export const VehiclesSchema = z
  .object({
    id: z.string().optional(),
    company_id: z.string(),
    registration_number: z.string().min(3),
    name: z.string().min(3),
    ownership: z.enum(vehicleOwnershipArray).default("self"),
    usage_payee_id: z.string().optional(),
    owner_payee_id: z.string().optional(),
    price: z.number().optional(),
    monthly_rate: z.number(),
    start_date: z.string(),
    end_date: z.string().optional(),
    is_active: z.boolean().default(true),
    vehicle_type: z.enum(vehicleTypeArray).default("passenger"),
    site_id: z.string(),
    photo: zFile.optional(),
  })
  .refine(
    (data) => {
      if (data.ownership === "payee" && !data.owner_payee_id) {
        return false;
      }
      return true;
    },
    {
      message: "Owner Payee is required when ownership is Payee",
      path: ["owner_payee_id"],
    },
  )
  .transform((data) => {
    if (data.ownership === "self") {
      return { ...data, owner_payee_id: null };
    }
    return data;
  });

export const VehiclesInsuranceSchema = z.object({
  id: z.string().optional(),
  vehicle_id: z.string(),
  insurance_number: z.string().min(3),
  insurance_company: z.string().min(3),
  insurance_yearly_amount: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  document: zFile.optional(),
});
export const VehiclesLoanSchema = z.object({
  vehicle_id: z.string(),
  bank_name: z.string().min(3),
  amount: z.number(),
  interest: z.number(),
  monthly_emi: z.number(),
  period: z.string(),
  start_date: z.string(),
  end_date: z.string().optional(),
  document: zFile.optional(),
});

export const VehicleUsageSchema = z.object({
  id: z.string().optional(),
  vehicle_id: z.string(),
  kilometers: z.number(),
  fuel_in_liters: z.number(),
  fuel_amount: z.number(),
  toll_amount: z.number(),
  maintainance_amount: z.number().optional(),
  month: z.number().min(1).max(12).default(defaultMonth),
  year: z.number().default(defaultYear),
});

export const ImportVehicleUsageHeaderSchema = z
  .object({
    registration_number: z.string(),
    kilometers: z.string().optional(),
    fuel_in_liters: z.string().optional(),
    fuel_amount: z.string().optional(),
    toll_amount: z.string().optional(),
    maintainance_amount: z.string().optional(),
  })
  .refine(
    (data) => {
      const values = [
        data.registration_number,
        data.kilometers,
        data.fuel_in_liters,
        data.fuel_amount,
        data.toll_amount,
        data.maintainance_amount,
      ].filter(Boolean);

      const uniqueValues = new Set(values);
      return uniqueValues.size === values.length;
    },
    {
      message:
        "Some fields have the same value. Please select different options.",
      path: [
        "registration_number",
        "kilometers",
        "fuel_in_liters",
        "fuel_amount",
        "toll_amount",
        "maintainance_amount",
      ],
    },
  );

export const ImportSingleVehicleUsageDataSchema = z.object({
  registration_number: zNumberString,
  month: z.preprocess(
    (value) => (typeof value === "string" ? Number.parseFloat(value) : value),
    z.number(),
  ),
  year: z.preprocess(
    (value) => (typeof value === "string" ? Number.parseFloat(value) : value),
    z.number(),
  ),
  kilometers: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = typeof value === "number" ? value : (typeof value === "string" ? Number.parseFloat(value) : Number(value));
      return isNaN(num) ? 0 : Math.round(num);
    },
    z.number(),
  ),
  fuel_in_liters: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = typeof value === "number" ? value : (typeof value === "string" ? Number.parseFloat(value) : Number(value));
      return isNaN(num) ? 0 : Math.round(num);
    },
    z.number(),
  ),
  fuel_amount: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = typeof value === "number" ? value : (typeof value === "string" ? Number.parseFloat(value) : Number(value));
      return isNaN(num) ? 0 : Math.round(num);
    },
    z.number(),
  ),
  toll_amount: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = typeof value === "number" ? value : (typeof value === "string" ? Number.parseFloat(value) : Number(value));
      return isNaN(num) ? 0 : Math.round(num);
    },
    z.number(),
  ),
  maintainance_amount: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return 0;
      const num = typeof value === "number" ? value : (typeof value === "string" ? Number.parseFloat(value) : Number(value));
      return isNaN(num) ? 0 : Math.round(num);
    },
    z.number(),
  ),
});

export const ImportVehicleUsageDataSchema = z.object({
  data: z.array(ImportSingleVehicleUsageDataSchema),
});

export const serviceChargesOnArray = ["basic", "gross", "ctc"] as const;

export const RelationshipManpowerVersionSchema = z.object({
  id: z.string().optional(),
  service_charge: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().optional(),
  ),
  reimbursement_charge: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().optional(),
  ),
  exit_charge: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().optional(),
  ),
  statutory_charge: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().optional(),
  ),
  service_charges_on: z.enum(serviceChargesOnArray).optional(),
  agreement_upload: z.any().optional(),
  relationship_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
});

export const LoanDeductionSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  salary_field_values_id: z.string().uuid().optional().nullable(),
  loan_id: z.string().uuid().optional().nullable(),
});

export const EmployeeAdvanceSchema = z.object({
  id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  employee_id: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional().nullable(),
  ),
  advance_name: z.string().optional().nullable(),
  amount: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().optional().nullable(),
  ),
  reimbursement_id: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional().nullable(),
  ),
  is_paid: z.boolean().optional().nullable(),
  advance_date: z.string().optional().nullable(),
  company_id: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional().nullable(),
  ),
});

// Audit Logs
export const AuditLogSchema = z.object({
  id: z.string().uuid().optional(),
  table_name: z.string(),
  action: z.string(),
  record_id: z.string().uuid().nullable().optional(),
  old_data: z.any().nullable().optional(),
  new_data: z.any().nullable().optional(),
  changed_by_id: z.string().uuid().nullable().optional(),
  changed_by_email: z.string().email().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  changed_at: z.string().optional(),
});
