export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Domingo = 0, Lunes = 1
  return d.toISOString().split("T")[0]; // Devolver solo la fecha
};

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
    if (totalWithdrawls !== 0) {
      currentCashFlow =
        totalGeneralDeposits !== 0
          ? ((totalDeposits - totalWithdrawls) / totalGeneralDeposits).toFixed(
              2
            )
          : -1;
    } else {
      currentCashFlow = 0;
    }

    currentCashFlow = currentCashFlow * 100;

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

export const groupByWeek = (transactions) => {
  return transactions.reduce((acc, transaction) => {
    const week = getStartOfWeek(transaction.transactionDate);

    if (!acc[week]) {
      acc[week] = [];
    }

    acc[week].push(transaction);

    return acc;
  }, {});
};
