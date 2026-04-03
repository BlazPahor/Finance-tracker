"use client";

import { useRef, useState } from "react";
import { getSettings, saveSettings } from "../../../lib/settings";
import { downloadBackup, restoreBackupData } from "../../../lib/backup";
import { formatAmount } from "../../../lib/format";
import { useToast } from "../../../components/toast-provider";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [startingBalance, setStartingBalance] = useState(() =>
    String(getSettings().startingBalance || 0)
  );
  const [balanceSnapshotDate, setBalanceSnapshotDate] = useState(() =>
    getSettings().balanceSnapshotDate || ""
  );
  const [recurringIncomeAmount, setRecurringIncomeAmount] = useState(() =>
    String(getSettings().recurringIncomeAmount || 0)
  );
  const [recurringIncomeStartDate, setRecurringIncomeStartDate] = useState(() =>
    getSettings().recurringIncomeStartDate || ""
  );
  const fileInputRef = useRef(null);

  const handleSave = () => {
    saveSettings({
      startingBalance: Number(startingBalance) || 0,
      balanceSnapshotDate,
      recurringIncomeAmount: Number(recurringIncomeAmount) || 0,
      recurringIncomeStartDate,
    });
    showToast("Nastavitve so shranjene.", "success");
  };

  const handleDownloadBackup = () => {
    downloadBackup();
    showToast("Backup je izvožen.", "success");
  };

  const handleRestoreBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const confirmed = window.confirm(
        "Obnovitev backupa bo prepisala trenutne podatke v aplikaciji. Želiš nadaljevati?"
      );

      if (!confirmed) {
        event.target.value = "";
        return;
      }

      restoreBackupData(parsed);
      showToast("Backup je obnovljen. Osveži dashboard za popoln prikaz sprememb.", "success");
    } catch {
      showToast("Backup datoteke ni bilo mogoče prebrati.", "error");
    }

    event.target.value = "";
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Nastavitve</h1>
        <p className="mt-2 text-sm text-gray-500">
          Nastavi snapshot stanja in redne mesečne prihodke.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="grid grid-cols-1 gap-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#111827]">
              Trenutno stanje
            </label>
            <input
              type="number"
              step="0.01"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111827]"
            />
            <div className="mt-2 text-xs text-gray-400">
              Trenutni vnos: €{formatAmount(startingBalance)}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#111827]">
              Datum trenutnega stanja
            </label>
            <input
              type="date"
              value={balanceSnapshotDate}
              onChange={(e) => setBalanceSnapshotDate(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111827]"
            />
            <div className="mt-2 text-xs text-gray-400">
              Primer: 2026-03-30
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#111827]">
              Mesečni redni prihodki
            </label>
            <input
              type="number"
              step="0.01"
              value={recurringIncomeAmount}
              onChange={(e) => setRecurringIncomeAmount(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111827]"
            />
            <div className="mt-2 text-xs text-gray-400">
              Trenutni vnos: €{formatAmount(recurringIncomeAmount)}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#111827]">
              Datum prejema prihodkov
            </label>
            <input
              type="date"
              value={recurringIncomeStartDate}
              onChange={(e) => setRecurringIncomeStartDate(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111827]"
            />
            <div className="mt-2 text-xs text-gray-400">
              Primer: 2026-04-10
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Shrani nastavitve
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Backup in izvoz</h2>
          <p className="mt-2 text-sm text-gray-500">
            Shrani varnostno kopijo podatkov v `.json` datoteko ali obnovi aplikacijo iz obstoječega backupa.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Izvozi backup
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-[#f9fafb]"
          >
            Obnovi iz backupa
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreBackup}
            className="hidden"
          />
        </div>

        <div className="mt-3 text-xs text-gray-400">
          Backup vsebuje transakcije, nastavitve in osnovne uporabniške preference.
        </div>

      </div>
    </div>
  );
}
