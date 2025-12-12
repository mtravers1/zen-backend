import businessService from "../services/businesses.service.js";
import permissionService from "../services/permissions.service.js";

const addBusiness = async (req, res) => {
  try {
    const data = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const permission = await permissionService.canPerformAction(
      uid,
      "create_business",
    );
    if (!permission.success) {
      return res.status(403).json(permission);
    }

    const response = await businessService.addBusinesses(data.business, email, uid);
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getUserProfiles = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await businessService.getUserProfiles(email, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const assignsAccountsToProfiles = async (req, res) => {
  try {
    const data = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await businessService.assignsAccountsToProfiles(
      data,
      email,
      uid,
    );
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const unlinkAccounts = async (req, res) => {
  try {
    const data = req.body;
    const uid = req.user.uid;
    const response = await businessService.unlinkAccounts(data, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const assignAccountToProfile = async (req, res) => {
  try {
    const { profileId, accountIds } = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await businessService.assignAccountToProfile(
      email,
      profileId,
      accountIds,
      uid,
    );
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const updateBusinessProfile = async (req, res) => {
  console.log("UPDATE BUSINESS PROFILE", req.body);
  try {
    const profileId = req.params.profileId;
    const formData = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await businessService.updateBusinessProfile(
      profileId,
      formData,
      email,
      uid,
    );
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteProfile = async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const uid = req.user.uid;
    const response = await businessService.deleteProfile(profileId, uid);
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const businessController = {
  addBusiness,
  getUserProfiles,
  assignsAccountsToProfiles,
  unlinkAccounts,
  assignAccountToProfile,
  updateBusinessProfile,
  deleteProfile,
};

export default businessController;
