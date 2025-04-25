export const calculateWeeklyTotals = (groupedTransactions) => {
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

    const depositoryWithdrawsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = creditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = creditTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
    const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

    const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
    const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

    let currentCashFlow = 0;
    if (totalDeposits === 0) {
      currentCashFlow = -999;
    } else if (totalDeposits === 0 && totalWithdrawls === 0) {
      currentCashFlow = 0;
    } else {
      currentCashFlow = (
        (totalDeposits - totalWithdrawls) /
        totalDeposits
      ).toFixed(2);
    }
    if (totalDeposits !== 0) {
      currentCashFlow = currentCashFlow * 100;
    }

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

  return orderedGrouped;
};
