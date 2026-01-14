import transactionsService from "../services/transactions.service.js";
import businessService from "../services/businesses.service.js";

const getUserTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { page = 1, limit = 50, paginate = false } = req.query;
    const transactions = await transactionsService.getUserTransactions(email, uid, {
      page: parseInt(page),
      limit: parseInt(limit),
      paginate: paginate === "true",
    });
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getProfileTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { profileId } = req.params;
    const { page = 1, limit = 50, paginate = false } = req.query;

    const profiles = await businessService.getUserProfiles(email, uid);
    const profile = profiles.find((p) => p.id.toString() === profileId);

    if (!profile) {
      return res.status(404).send({ message: "Profile not found" });
    }

    const transactions = await transactionsService.getProfileTransactions(
      profile,
      uid,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        paginate: paginate === "true",
      },
    );
    res.status(200).send(transactions);
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
};

const getTransactionsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const uid = req.user.uid;
    const { page = 1, limit = 50, paginate = false } = req.query;
    const transactions = await transactionsService.getTransactionsByAccount(
      accountId,
      uid,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        paginate: paginate === "true",
      },
    );
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const transactionsController = {
    getUserTransactions,
    getProfileTransactions,
    getTransactionsByAccount,
};

export default transactionsController;
