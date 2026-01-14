import cashflowService from "../services/cashflow.service.js";

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

    const cashFlows = await cashflowService.getCashFlowsByPlaidAccount(
      account,
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
