export const calculateWeeklyTotals = (groupedTransactions, allTransactions) => {
  const weeklySummary = [];
  let totalGeneralDeposits = 0;

  for (const week in groupedTransactions) {
    const weekTransactions = groupedTransactions[week];

    const depositoryTransactions = weekTransactions.filter(
      (t) => t.accountType === "depository"
    );
    const creditTransactions = weekTransactions.filter(
      (t) => t.accountType === "credit"
    );

    const depositoryDepositsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = creditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);

    totalGeneralDeposits += depositDepositsAmountAbs + creditDepositsAmountAbs;
  }

  const internalTxns = allTransactions.filter((txn) => txn.isInternal);

  const txnMap = new Map(internalTxns.map((txn) => [String(txn._id), txn]));

  const toRemove = new Set();

  internalTxns.forEach((txn) => {
    const refId = txn.internalReference?.toString();
    if (refId && txnMap.has(refId)) {
      toRemove.add(String(txn._id));
      toRemove.add(refId);
    }
  });

  const filteredTxns = internalTxns.filter(
    (txn) => !toRemove.has(String(txn._id))
  );

  const filteredOutIds = new Set(filteredTxns.map((txn) => String(txn._id)));

  for (const week in groupedTransactions) {
    const weekTransactions = groupedTransactions[week];
    const depositoryTransactions = weekTransactions.filter(
      (t) => t.accountType === "depository"
    );
    const creditTransactions = weekTransactions.filter(
      (t) => t.accountType === "credit"
    );

    const cleanDepositoryTxns = depositoryTransactions.filter(
      (txn) => !filteredOutIds.has(String(txn._id))
    );

    const cleanCreditTxns = creditTransactions.filter(
      (txn) => !filteredOutIds.has(String(txn._id))
    );

    const depositoryDepositsAmount = cleanDepositoryTxns
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = cleanDepositoryTxns
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = cleanCreditTxns
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = cleanCreditTxns
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);

    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
    const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

    const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
    const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

    let currentCashFlow = 0;

    currentCashFlow = (totalDeposits - totalWithdrawls).toFixed(2);

    weeklySummary.push({
      week,
      depository: {
        deposits: depositoryDepositsAmount,
        withdraws: depositoryWithdrawsAmount,
      },
      credit: {
        deposits: creditDepositsAmount,
        withdraws: creditWithdrawsAmount,
      },
      cashFlow: currentCashFlow,
      totalWeeklyDeposits: totalDeposits,
      totalWeeklyWithdrawls: totalWithdrawls,
      totalWithdrawls,
    });
  }

  return weeklySummary;
};

export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // Domingo=0, Lunes=1, ..., Sábado=6
  const diff = day === 0 ? -6 : 1 - day; // Lunes = día 1
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0]; // solo la fecha
};
export const groupByWeek = (transactions) => {
  const groupedTrans = transactions.reduce((acc, transaction) => {
    const week = getStartOfWeek(transaction.transactionDate);
    if (!acc[week]) {
      acc[week] = [];
    }

    acc[week].push(transaction);

    return acc;
  }, {});

  const orderedGrouped = Object.keys(groupedTrans)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .reduce((obj, key) => {
      obj[key] = groupedTrans[key];
      return obj;
    }, {});
  //console.log(orderedGrouped);
  /*const keys = Object.keys(orderedGrouped).map((or) => {
    console.log("WEEK", or);
    //const weekSet = orderedGroped[or];
    //console.log("WEEK", or, weekSet);
    return or;
  });

  keys.map((dt) => {
    const og = orderedGrouped[dt];
    og.map((data) => {
      console.log(
        "Weekk Data: ",
        dt,
        data.transactionDate,
        data.accountType,
        data.amount
      );
    });
  });*/

  return orderedGrouped;
};
