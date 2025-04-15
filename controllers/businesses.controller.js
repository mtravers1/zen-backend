import businessService from "../services/businesses.service.js";

const addBusiness = async (req, res) => {
  try {
    const data = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await businessService.addBusinesses(data, email, uid);
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
      uid
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
      uid
    );
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
};

export default businessController;
