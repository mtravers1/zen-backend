import cashflowService from "../services/cashflow.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";

const getCashFlows = async (req, res) => {
  try {
    const { profile } = req.body;
    const uid = req.user.uid;
    const cashFlows = await cashflowService.getCashFlows(profile, uid);
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getCashFlowsWeekly = async (req, res) => {
  try {
    const { profile } = req.body;
    const uid = req.user.uid;
    const cashFlows = await cashflowService.getCashFlowsWeekly(profile, uid);
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getCashFlowsByPlaidAccount = async (req, res) => {
  try {
    const { account } = req.body;
    const uid = req.user.uid;

    let plaidAccount;

    // Check if 'account' is a string (ID) or an object
    if (typeof account === 'string') {
      // If it's a string, fetch the account object from DB
      plaidAccount = await PlaidAccount.findOne({ plaid_account_id: account }).lean();
    } else if (typeof account === 'object' && account !== null) {
      // If it's an object, assume it's the full account object
      plaidAccount = account;
    }

    if (!plaidAccount) {
      return res.status(404).send({ message: "Plaid account not found or invalid account data provided" });
    }

    const cashFlows = await cashflowService.getCashFlowsByPlaidAccount(
      plaidAccount,
      uid,
    );
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};


const cashflowController = {
    getCashFlows,
    getCashFlowsWeekly,
    getCashFlowsByPlaidAccount,
};

export default cashflowController;
