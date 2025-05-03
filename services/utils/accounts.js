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

  for (const week in groupedTransactions) {
    const weekTransactions = groupedTransactions[week];

    const depositoryTransactions = weekTransactions.filter(
      (t) => t.accountType === "depository"
    );
    const creditTransactions = weekTransactions.filter(
      (t) => t.accountType === "credit"
    );

    const depositoryDepositsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount < 0)
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

  //console.log("WEEKLY", weeklySummary);

  return weeklySummary;
};

/*export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // Domingo=0, Lunes=1, ..., Sábado=6
  const diff = day === 0 ? -6 : 1 - day; // Lunes = día 1
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0]; // solo la fecha
};*/

export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // Domingo = 0, Lunes = 1, ..., Sábado = 6
  const diff = day === 0 ? -6 : 1 - day; // Lunes = día 1, Domingo = -6 (anterior lunes)
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
};

export const groupByWeek = (transactions) => {
  if (transactions.length === 0) return {};

  const groupedTrans = transactions.reduce((acc, transaction) => {
    const week = getStartOfWeek(transaction.transactionDate);
    if (!acc[week]) acc[week] = [];
    acc[week].push(transaction);
    return acc;
  }, {});

  // Obtener las semanas mínima y máxima del grupo
  const allWeeksSorted = Object.keys(groupedTrans).sort(
    (a, b) => new Date(a) - new Date(b)
  );

  const start = new Date(allWeeksSorted[0]);
  const end = new Date(allWeeksSorted[allWeeksSorted.length - 1]);

  // Iterar por todas las semanas entre el inicio y el fin
  const orderedGrouped = {};
  const current = new Date(start);
  while (current <= end) {
    const key = current.toISOString().split("T")[0];
    orderedGrouped[key] = groupedTrans[key] || [];
    current.setUTCDate(current.getUTCDate() + 7); // avanzar a la siguiente semana
  }

  /*const keys = Object.keys(orderedGrouped).map((or) => {
    console.log("WEEK", or);
    const weekSet = orderedGrouped[or];
    console.log("WEEK", or, weekSet.length);
    return or;
  });

  keys.map((dt, index) => {
    const og = orderedGrouped[dt];
    og.map((data) => {
      console.log(
        index,
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
