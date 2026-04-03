export function getSettings() {
  if (typeof window === "undefined") {
    return {
      startingBalance: 0,
      balanceSnapshotDate: "",
      recurringIncomeAmount: 0,
      recurringIncomeStartDate: "",
    };
  }

  const raw = localStorage.getItem("financeSettings");

  if (!raw) {
    return {
      startingBalance: 0,
      balanceSnapshotDate: "",
      recurringIncomeAmount: 0,
      recurringIncomeStartDate: "",
    };
  }

  try {
    const parsed = JSON.parse(raw);

    return {
      startingBalance: Number(parsed.startingBalance) || 0,
      balanceSnapshotDate: parsed.balanceSnapshotDate || "",
      recurringIncomeAmount: Number(parsed.recurringIncomeAmount) || 0,
      recurringIncomeStartDate: parsed.recurringIncomeStartDate || "",
    };
  } catch {
    return {
      startingBalance: 0,
      balanceSnapshotDate: "",
      recurringIncomeAmount: 0,
      recurringIncomeStartDate: "",
    };
  }
}

export function saveSettings(settings) {
  const normalized = {
    startingBalance: Number(settings.startingBalance) || 0,
    balanceSnapshotDate: settings.balanceSnapshotDate || "",
    recurringIncomeAmount: Number(settings.recurringIncomeAmount) || 0,
    recurringIncomeStartDate: settings.recurringIncomeStartDate || "",
  };

  localStorage.setItem("financeSettings", JSON.stringify(normalized));
}