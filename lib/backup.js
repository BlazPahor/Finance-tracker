import { getTransactions } from "./storage";
import { getSettings, saveSettings } from "./settings";

function getPreferenceValue(key, fallbackValue) {
  if (typeof window === "undefined") return fallbackValue;

  const saved = localStorage.getItem(key);
  if (saved === null) return fallbackValue;

  return saved === "true";
}

export function createBackupData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: getTransactions(),
    settings: getSettings(),
    preferences: {
      showOverallBalance: getPreferenceValue("showOverallBalance", true),
    },
  };
}

export function downloadBackup() {
  if (typeof window === "undefined") return;

  const backup = createBackupData();
  const fileName = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(downloadUrl);
}

export function restoreBackupData(backup) {
  if (typeof window === "undefined") return false;

  if (!backup || typeof backup !== "object") {
    throw new Error("Neveljavna backup datoteka.");
  }

  const transactions = Array.isArray(backup.transactions) ? backup.transactions : [];
  const settings = backup.settings || {};
  const showOverallBalance =
    typeof backup.preferences?.showOverallBalance === "boolean"
      ? backup.preferences.showOverallBalance
      : true;

  localStorage.setItem("transactions", JSON.stringify(transactions));
  saveSettings(settings);
  localStorage.setItem("showOverallBalance", String(showOverallBalance));

  return true;
}
