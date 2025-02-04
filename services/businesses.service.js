import User from "../database/models/User.js";
import Business from "../database/models/Businesses.js";

const addBusinesses = async (businessData, email) => {

  const user = await User.findOne({ "email.email": email });

  if (!user) {
    throw new Error("User not found");
  }

  const userId = user._id.toString();

  const newBusiness = new Business({
    user_id: userId,
    name: businessData.name,
    legal_name: businessData.legal_name,
    encrypted_ein: businessData.encrypted_ein,
    business_desc: businessData.business_desc,
    business_code: businessData.business_code,
    entity_type: businessData.entity_type,
    addresses: businessData.addresses || [],
    website: businessData.website,
    phone_numbers: businessData.phone_numbers || [],
    industry_desc: businessData.industry_desc,
    plaid_account_ids: businessData.plaid_account_ids || [],
    document_ids: businessData.document_ids || [],
    goal_ids: businessData.goal_ids || [],
    subsidiaries: businessData.subsidiaries || [],
    business_locations: businessData.business_locations || [],
    accounting_info: businessData.accounting_info || {},
    fiscal_year_start: businessData.fiscal_year_start,
    tax_information: businessData.tax_information || {},
    payroll_details: businessData.payroll_details || {},
    formation_date: businessData.formation_date,
    business_hours: businessData.business_hours || [],
    timezone: businessData.timezone,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await newBusiness.save();

  return newBusiness;
};


const businessService = {
    addBusinesses
};

export default businessService;