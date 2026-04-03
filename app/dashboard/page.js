"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
    getTransactions,
    deleteTransaction,
    markDebtAsPaid,
    markDebtAsOpen,
    updateTransaction,
} from "../../lib/storage";
import { getSettings } from "../../lib/settings";
import { formatAmount } from "../../lib/format";
import { useToast } from "../../components/toast-provider";

const EMPTY_SETTINGS = {
    startingBalance: 0,
    balanceSnapshotDate: "",
    recurringIncomeAmount: 0,
    recurringIncomeStartDate: "",
};

function subscribe() {
    return () => { };
}

function getYearFromDate(dateValue) {
    if (!dateValue) return "";

    if (typeof dateValue === "string" && dateValue.includes("-")) {
        return dateValue.split("-")[0];
    }

    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
        return String(parsed.getFullYear());
    }

    return "";
}

function getMonthFromDate(dateValue) {
    if (!dateValue || typeof dateValue !== "string" || !dateValue.includes("-")) {
        return "";
    }

    return dateValue.slice(0, 7);
}

function getMonthLabel(monthValue) {
    if (!monthValue) return "Mesečno";

    const [year, month] = monthValue.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);

    return date.toLocaleDateString("sl-SI", {
        month: "long",
        year: "numeric",
    });
}

function getRecurringDateForMonth(monthValue, recurringStartDate) {
    const [year, month] = monthValue.split("-").map(Number);
    const startDay = Number(recurringStartDate.slice(8, 10));

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const day = Math.min(startDay, lastDayOfMonth);

    return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function getNextMonth(monthValue) {
    const [year, month] = monthValue.split("-").map(Number);
    const next = new Date(year, month, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function countTriggeredRecurringSinceSnapshot(
    snapshotDate,
    recurringStartDate,
    recurringIncomeAmount,
    endMonth
) {
    if (!snapshotDate || !recurringStartDate || !recurringIncomeAmount || !endMonth) {
        return 0;
    }

    const snapshot = new Date(snapshotDate);
    const today = new Date();
    let count = 0;
    let cursor = recurringStartDate.slice(0, 7);

    while (cursor <= endMonth) {
        const triggerDate = getRecurringDateForMonth(cursor, recurringStartDate);

        if (triggerDate > snapshot && triggerDate <= today) {
            count += 1;
        }

        cursor = getNextMonth(cursor);
    }

    return count;
}

function groupByMonth(
    transactions,
    recurringIncomeAmount = 0,
    recurringIncomeStartDate = ""
) {
    const months = {};

    transactions.forEach((t) => {
        if (!t.date || typeof t.date !== "string" || !t.date.includes("-")) return;

        const month = t.date.slice(0, 7);

        if (!months[month]) {
            months[month] = {
                income: 0,
                expense: 0,
            };
        }

        if (t.type === "Income") {
            months[month].income += Number(t.amount) || 0;
        } else if (t.type === "Debt" && t.paid) {
            const paidMonth = t.paidAt ? t.paidAt.slice(0, 7) : month;

            if (!months[paidMonth]) {
                months[paidMonth] = { income: 0, expense: 0 };
            }

            months[paidMonth].income += Number(t.amount) || 0;
        } else if (
            t.type === "Expense" ||
            t.type === "Subscription" ||
            (t.type === "Debt" && !t.paid)
        ) {
            months[month].expense += Number(t.amount) || 0;
        }
    });

    if (recurringIncomeAmount > 0 && recurringIncomeStartDate) {
        let cursor = recurringIncomeStartDate.slice(0, 7);
        const todayMonth = new Date().toISOString().slice(0, 7);

        while (cursor <= todayMonth) {
            if (!months[cursor]) {
                months[cursor] = { income: 0, expense: 0 };
            }

            const triggerDate = getRecurringDateForMonth(cursor, recurringIncomeStartDate);
            const today = new Date();

            if (triggerDate <= today) {
                months[cursor].income += Number(recurringIncomeAmount) || 0;
            }

            cursor = getNextMonth(cursor);
        }
    }

    return Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, values]) => ({
            month,
            income: values.income,
            expense: values.expense,
        }));
}

function SubscriptionForm({ onAdd }) {
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");

    const handleAdd = () => {
        if (!title.trim() || !amount) return;

        const tx = {
            id:
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()),
            title: title.trim(),
            amount: Number(amount),
            type: "Subscription",
            category: "Subscriptions",
            date: new Date().toISOString().slice(0, 10),
            note: "",
        };

        const existing = getTransactions();
        localStorage.setItem("transactions", JSON.stringify([tx, ...existing]));

        const addedTitle = title.trim();
        setTitle("");
        setAmount("");
        onAdd(`Naročnina "${addedTitle}" je dodana.`);
    };

    return (
        <div className="flex flex-col gap-2 lg:flex-row">
            <input
                placeholder="Netflix"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <input
                placeholder="9.99"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827] lg:w-28"
            />

            <button
                id="subscription-submit-button"
                onClick={handleAdd}
                className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 lg:hidden"
            >
                Dodaj
            </button>
        </div>
    );
}

function ExpenseForm({ onAdd }) {
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState("Other");

    const handleAdd = () => {
        if (!title.trim() || !amount) return;

        const tx = {
            id:
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()),
            title: title.trim(),
            amount: Number(amount),
            type: "Expense",
            category,
            date: new Date().toISOString().slice(0, 10),
            note: "",
        };

        const existing = getTransactions();
        localStorage.setItem("transactions", JSON.stringify([tx, ...existing]));

        const addedTitle = title.trim();
        setTitle("");
        setAmount("");
        setCategory("Other");
        onAdd(`Strošek "${addedTitle}" je dodan.`);
    };

    return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_160px_110px]">
            <input
                placeholder="Kava, gorivo, hrana..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <input
                placeholder="12.50"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            >
                <option>Drugo</option>
                <option>Restavracije</option>
                <option>Hrana</option>
                <option>Prevoz</option>
                <option>Osebno</option>
                <option>Zdravje</option>
                <option>Uživanje</option>
                <option>Naročnine</option>
                <option>Dolgovi</option>
            </select>

            <button
                onClick={handleAdd}
                className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
                Dodaj strošek
            </button>
        </div>
    );
}
function IncomeForm({ onAdd }) {
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");

    const handleAdd = () => {
        if (!title.trim() || !amount) return;

        const tx = {
            id:
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()),
            title: title.trim(),
            amount: Number(amount),
            type: "Income",
            category: "Income",
            date: new Date().toISOString().slice(0, 10),
            note: "",
        };

        const existing = getTransactions();
        localStorage.setItem("transactions", JSON.stringify([tx, ...existing]));

        const addedTitle = title.trim();
        setTitle("");
        setAmount("");
        onAdd(`Prihodek "${addedTitle}" je dodan.`);
    };

    return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_120px]">
            <input
                placeholder="Plača, vračilo, bonus..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <input
                placeholder="750.00"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <button
                onClick={handleAdd}
                className="rounded-lg bg-[#166534] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
                Dodaj prihodek
            </button>
        </div>
    );
}
function DebtForm({ onAdd }) {
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");

    const handleAdd = () => {
        if (!title.trim() || !amount) return;

        const tx = {
            id:
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()),
            title: title.trim(),
            amount: Number(amount),
            type: "Debt",
            category: "Dolgovi",
            date: new Date().toISOString().slice(0, 10),
            note: "",
            paid: false,
            paidAt: "",
        };

        const existing = getTransactions();
        localStorage.setItem("transactions", JSON.stringify([tx, ...existing]));

        const addedTitle = title.trim();
        setTitle("");
        setAmount("");
        onAdd(`Dolg "${addedTitle}" je dodan.`);
    };

    return (
        <div className="flex flex-col gap-2 sm:flex-row">
            <input
                placeholder="A1 modem"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827]"
            />

            <input
                placeholder="61.83"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-[#111827] sm:w-28"
            />

            <button
                onClick={handleAdd}
                className="rounded-lg bg-[#991b1b] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
                Dodaj dolg
            </button>
        </div>
    );
}

function EditTransactionForm({ transaction, onCancel, onSave }) {
    const [title, setTitle] = useState(transaction.title || "");
    const [amount, setAmount] = useState(String(transaction.amount ?? ""));
    const [date, setDate] = useState(transaction.date || "");
    const [note, setNote] = useState(transaction.note || "");
    const [category, setCategory] = useState(
        transaction.type === "Expense" ? transaction.category || "Other" : transaction.category || ""
    );

    const handleSubmit = () => {
        if (!title.trim() || !amount) return;

        const normalizedCategory =
            transaction.type === "Expense"
                ? category || "Other"
                : transaction.type === "Subscription"
                  ? "Subscriptions"
                  : transaction.type === "Debt"
                    ? "Dolgovi"
                    : "Income";

        onSave({
            ...transaction,
            title: title.trim(),
            amount: Number(amount),
            date,
            note,
            category: normalizedCategory,
        });
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onCancel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6"
            onClick={onCancel}
        >
            <div
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_60px_rgba(16,24,40,0.18)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Uredi transakcijo</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Urejaš: {transaction.title} ({transaction.type === "Income"
                                ? "Prihodek"
                                : transaction.type === "Expense"
                                    ? "Strošek"
                                    : transaction.type === "Subscription"
                                        ? "Naročnina"
                                        : "Dolg"})
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#f9fafb]"
                    >
                        Prekliči
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#111827]">Naslov</label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#111827]"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#111827]">Znesek</label>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#111827]"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#111827]">Datum</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#111827]"
                        />
                    </div>

                    {transaction.type === "Expense" && (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[#111827]">Kategorija</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#111827]"
                            >
                                <option>Other</option>
                                <option>Restaurant</option>
                                <option>Food</option>
                                <option>Transport</option>
                                <option>Personal</option>
                                <option>Health</option>
                                <option>Enjoyment</option>
                                <option>Subscriptions</option>
                                <option>Dolgovi</option>
                            </select>
                        </div>
                    )}

                    <div className={transaction.type === "Expense" ? "md:col-span-2" : "md:col-span-1"}>
                        <label className="mb-2 block text-sm font-medium text-[#111827]">Opomba</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#111827]"
                        />
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-[#f9fafb]"
                    >
                        Prekliči
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                    >
                        Shrani spremembe
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { showToast } = useToast();
    const isHydrated = useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    );
    const [refreshKey, setRefreshKey] = useState(0);
    const [transactionFormType, setTransactionFormType] = useState("expense");
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [showOverallBalanceOverride, setShowOverallBalanceOverride] = useState(null);
    const [editingTransaction, setEditingTransaction] = useState(null);

    const transactions = useMemo(() => {
        if (!isHydrated) return [];
        void refreshKey;

        return getTransactions();
    }, [isHydrated, refreshKey]);

    const settings = useMemo(() => {
        if (!isHydrated) return EMPTY_SETTINGS;
        void refreshKey;

        return getSettings();
    }, [isHydrated, refreshKey]);

    const savedShowOverallBalance = useSyncExternalStore(
        subscribe,
        () => {
            const saved = localStorage.getItem("showOverallBalance");
            return saved === null ? true : saved === "true";
        },
        () => true
    );

    const showOverallBalance =
        showOverallBalanceOverride === null
            ? savedShowOverallBalance
            : showOverallBalanceOverride;

    const refreshTransactions = (message) => {
        setRefreshKey((value) => value + 1);

        if (message) {
            showToast(message, "success");
        }
    };

    const handleDelete = (id) => {
        const transaction = transactions.find((item) => String(item.id) === String(id));
        deleteTransaction(id);
        refreshTransactions(
            transaction ? `"${transaction.title}" je izbrisan.` : "Postavka je izbrisana."
        );
    };

    const handleMarkDebtPaid = (id) => {
        const transaction = transactions.find((item) => String(item.id) === String(id));
        markDebtAsPaid(id);
        refreshTransactions(
            transaction ? `Dolg "${transaction.title}" je označen kot plačan.` : "Dolg je označen kot plačan."
        );
    };

    const handleMarkDebtOpen = (id) => {
        const transaction = transactions.find((item) => String(item.id) === String(id));
        markDebtAsOpen(id);
        refreshTransactions(
            transaction ? `Dolg "${transaction.title}" je ponovno odprt.` : "Dolg je ponovno odprt."
        );
    };

    const handleSaveEdit = (updatedTransaction) => {
        updateTransaction(updatedTransaction);
        setEditingTransaction(null);
        refreshTransactions(`"${updatedTransaction.title}" je posodobljen.`);
    };

    const handleStartEdit = (transaction) => {
        setEditingTransaction(transaction);
    };

    const handleToggleOverallBalance = () => {
        const nextValue = !showOverallBalance;

        setShowOverallBalanceOverride(nextValue);

        if (typeof window !== "undefined") {
            localStorage.setItem("showOverallBalance", String(nextValue));
        }
    };

    const currentMonthValue = selectedMonth || new Date().toISOString().slice(0, 7);



    const recurringIncomeStartMonth = settings.recurringIncomeStartDate
        ? settings.recurringIncomeStartDate.slice(0, 7)
        : "";

    const recurringIncomeThisMonth =
        recurringIncomeStartMonth && currentMonthValue >= recurringIncomeStartMonth
            ? Number(settings.recurringIncomeAmount) || 0
            : 0;

    const recurringIncomeOverall =
        countTriggeredRecurringSinceSnapshot(
            settings.balanceSnapshotDate,
            settings.recurringIncomeStartDate,
            settings.recurringIncomeAmount,
            currentMonthValue
        ) * (Number(settings.recurringIncomeAmount) || 0);

    const monthlyData = groupByMonth(
        transactions,
        Number(settings.recurringIncomeAmount) || 0,
        settings.recurringIncomeStartDate
    );
    const availableMonths = monthlyData.length
        ? monthlyData.map((m) => m.month)
        : Array.from(
            new Set(transactions.map((t) => getMonthFromDate(t.date)).filter(Boolean))
        );

    const maxChartValue =
        monthlyData.length > 0
            ? Math.max(...monthlyData.map((x) => Math.max(x.income, x.expense)), 1)
            : 1;

    const monthlyTransactions = transactions.filter(
        (t) => getMonthFromDate(t.date) === currentMonthValue
    );
    const filteredTransactions = monthlyTransactions
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const isOnOrAfterSnapshot = (dateValue) => {
        if (!settings.balanceSnapshotDate) return true;
        if (!dateValue) return true;
        return String(dateValue) >= String(settings.balanceSnapshotDate);
    };

    const overallTransactionDelta = transactions.reduce((sum, t) => {
        const amount = Number(t.amount) || 0;

        if (t.type === "Income") {
            if (!isOnOrAfterSnapshot(t.date)) return sum;
            return sum + amount;
        }

        if (t.type === "Expense") {
            if (!isOnOrAfterSnapshot(t.date)) return sum;
            return sum - amount;
        }

        if (t.type === "Subscription") {
            if (!isOnOrAfterSnapshot(t.date)) return sum;
            return sum - amount;
        }

        if (t.type === "Debt") {
            if (t.paid) {
                if (!isOnOrAfterSnapshot(t.paidAt || t.date)) return sum;
                return sum + amount;
            }

            if (!isOnOrAfterSnapshot(t.date)) return sum;
            return sum - amount;
        }

        return sum;
    }, 0);

    const overallOpenDebts = transactions
        .filter((t) => t.type === "Debt" && !t.paid)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const monthlyAdditionalIncome = monthlyTransactions
        .filter((t) => t.type === "Income")
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const monthlyIncome =
        recurringIncomeThisMonth + monthlyAdditionalIncome;

    const monthlyExpenses = monthlyTransactions
        .filter(
            (t) =>
                t.type === "Expense" ||
                t.type === "Subscription" ||
                (t.type === "Debt" && !t.paid)
        )
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const monthlyResult = monthlyIncome - monthlyExpenses;

    const overallBalance =
        (Number(settings.startingBalance) || 0) +
        recurringIncomeOverall +
        overallTransactionDelta;

    const expenseTransactionsForCategory = monthlyTransactions.filter(
        (t) =>
            t.type === "Expense" ||
            t.type === "Subscription" ||
            (t.type === "Debt" && !t.paid)
    );

    const totalExpensesForCategory = expenseTransactionsForCategory.reduce(
        (sum, t) => sum + (Number(t.amount) || 0),
        0
    );

    const categoryMap = {};

    expenseTransactionsForCategory.forEach((t) => {
        const categoryName = t.category || "Other";

        if (!categoryMap[categoryName]) {
            categoryMap[categoryName] = 0;
        }

        categoryMap[categoryName] += Number(t.amount) || 0;
    });

    const categoryData = Object.entries(categoryMap)
        .map(([name, value]) => ({
            name,
            value,
            percent: totalExpensesForCategory
                ? Math.round((value / totalExpensesForCategory) * 100)
                : 0,
        }))
        .sort((a, b) => b.value - a.value);

    const reminderDebts = useMemo(() => {
        return transactions.filter((t) => t.type === "Debt" && !t.paid);
    }, [transactions]);

    const allDebtItems = transactions
        .filter((t) => t.type === "Debt")
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    return (
        <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Nadzorna plošča</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Skupno stanje in mesečni pregled za {getMonthLabel(currentMonthValue)}.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    <div className="relative inline-flex h-[42px] min-w-[160px] items-center sm:min-w-[190px]">
                        <select
                            value={currentMonthValue}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="absolute inset-0 z-10 cursor-pointer opacity-0"
                        >
                            {availableMonths
                                .sort()
                                .reverse()
                                .map((month) => (
                                    <option key={month} value={month}>
                                        {getMonthLabel(month)}
                                    </option>
                                ))}
                        </select>
                        <div className="inline-flex h-[42px] min-w-[160px] items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm sm:min-w-[190px]">
                            <span>{getMonthLabel(currentMonthValue)}</span>
                            <span className="ml-3 text-gray-500">▾</span>
                        </div>
                    </div>

                    <Link
                        href="/dashboard/import"
                        className="inline-flex items-center justify-center rounded-xl bg-[#107c41] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-[#0e6e3a] active:bg-[#0b5d31] sm:self-auto"
                        style={{ backgroundColor: "#107c41", color: "#ffffff" }}
                    >
                        Uvozi Excel
                    </Link>
                </div>
            </div>

            {reminderDebts.length > 0 && (
                <div className="mb-5 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
                    <div className="text-sm font-semibold text-[#991b1b]">Opomniki za dolgove</div>
                    <div className="mt-2 text-sm text-[#b91c1c]">
                        Imaš {reminderDebts.length} neplačan{reminderDebts.length === 1 ? " dolg" : reminderDebts.length >= 2 && reminderDebts.length <= 4 ? "e dolgove" : "ih dolgov"}. Preveri status plačil.
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">Skupno stanje</div>

                        <button
                            type="button"
                            onClick={handleToggleOverallBalance}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-gray-700 transition hover:bg-[#e5e7eb]"
                        >
                            {showOverallBalance ? (
                                <Eye size={16} />
                            ) : (
                                <EyeOff size={16} />
                            )}
                        </button>
                    </div>

                    <div className="mt-3 text-3xl font-semibold tracking-tight">
                        {showOverallBalance ? `€${formatAmount(overallBalance)}` : "••••••"}
                    </div>

                    <div className="mt-2 text-xs text-gray-400">
                        Snapshot + spremembe po snapshotu
                    </div>
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="text-sm text-gray-500">Mesečni prihodki</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">
                        €{formatAmount(monthlyIncome)}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                        Redni + dodatni prihodki
                    </div>
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="text-sm text-gray-500">Mesečni stroški</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">
                        €{formatAmount(monthlyExpenses)}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                        Stroški + naročnine + odprti dolgovi
                    </div>
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="text-sm text-gray-500">Mesečni rezultat</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">
                        €{formatAmount(monthlyResult)}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                        Prihodki - stroški za izbrani mesec
                    </div>
                </div>

                <div
                    className={`rounded-2xl border p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${overallOpenDebts > 0
                        ? "border-[#fecaca] bg-[#fef2f2]"
                        : "border-[#e5e7eb] bg-white"
                        }`}
                >
                    <div className="text-sm text-gray-500">Odprti dolgovi</div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">
                        €{formatAmount(overallOpenDebts)}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">Vsi neplačani dolgovi</div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] xl:col-span-2">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">Pregled denarnega toka</h2>
                            <p className="mt-1 text-sm text-gray-500">Mesečni prihodki proti stroškom</p>
                        </div>
                        <div className="rounded-lg bg-[#f9fafb] px-3 py-1.5 text-xs text-gray-500">
                            Dejanski podatki
                        </div>
                    </div>

                    {monthlyData.length === 0 ? (
                        <div className="flex h-72 items-center justify-center rounded-xl bg-[#fafafa] text-sm text-gray-400">
                            Za zdaj še ni mesečnih podatkov.
                        </div>
                    ) : (
                        <div className="rounded-xl bg-[#fafafa] p-4 sm:p-6">
                            <div
                                style={{
                                    minHeight: "220px",
                                    display: "flex",
                                    alignItems: "flex-end",
                                    gap: "16px",
                                    overflowX: "auto",
                                }}
                            >
                                {monthlyData.map((m) => {
                                    const incomeHeight = Math.max((m.income / maxChartValue) * 180, 8);
                                    const expenseHeight = Math.max((m.expense / maxChartValue) * 180, 8);

                                    return (
                                        <div
                                            key={m.month}
                                            style={{
                                                minWidth: "56px",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: "8px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: "190px",
                                                    display: "flex",
                                                    alignItems: "flex-end",
                                                    gap: "8px",
                                                }}
                                            >
                                                <div
                                                    title={`Prihodki: €${formatAmount(m.income)}`}
                                                    style={{
                                                        width: "20px",
                                                        height: `${incomeHeight}px`,
                                                        backgroundColor: "#cbdcf6",
                                                        borderTopLeftRadius: "6px",
                                                        borderTopRightRadius: "6px",
                                                    }}
                                                />
                                                <div
                                                    title={`Stroški: €${formatAmount(m.expense)}`}
                                                    style={{
                                                        width: "20px",
                                                        height: `${expenseHeight}px`,
                                                        backgroundColor: "#111827",
                                                        borderTopLeftRadius: "6px",
                                                        borderTopRightRadius: "6px",
                                                    }}
                                                />
                                            </div>

                                            <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                                {m.month.slice(5)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
                                <div className="flex items-center gap-2">
                                    <div
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            borderRadius: "3px",
                                            backgroundColor: "#cbdcf6",
                                        }}
                                    ></div>
                                    <span>Prihodki</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            borderRadius: "3px",
                                            backgroundColor: "#111827",
                                        }}
                                    ></div>
                                    <span>Stroški</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold tracking-tight">Razdelitev po kategorijah</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Razporeditev stroškov za {getMonthLabel(currentMonthValue)}
                        </p>
                    </div>

                    <div className="space-y-4">
                        {categoryData.length === 0 ? (
                            <div className="text-sm text-gray-400">Za zdaj še ni kategorij stroškov.</div>
                        ) : (
                            categoryData.map((cat) => (
                                <div key={cat.name}>
                                    <div className="mb-2 flex items-center justify-between text-sm">
                                        <span>{cat.name}</span>
                                        <span className="text-gray-500">{cat.percent}%</span>
                                    </div>

                                    <div className="h-2 rounded-full bg-[#f3f4f6]">
                                        <div
                                            className="h-2 rounded-full bg-[#111827]"
                                            style={{ width: `${cat.percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] xl:col-span-2">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold tracking-tight">Nedavne transakcije</h2>
                        <p className="mt-1 text-sm text-gray-500">Zadnja finančna aktivnost za {getMonthLabel(currentMonthValue)}.</p>

                        <div className="mt-4">
                            <div className="mb-3 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTransactionFormType("expense")}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${transactionFormType === "expense"
                                        ? "bg-[#111827] text-white"
                                        : "bg-[#f3f4f6] text-gray-700"
                                        }`}
                                >
                                    Strošek
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setTransactionFormType("income")}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${transactionFormType === "income"
                                        ? "bg-[#166534] text-white"
                                        : "bg-[#f3f4f6] text-gray-700"
                                        }`}
                                >
                                    Prihodek
                                </button>
                            </div>

                            {transactionFormType === "expense" ? (
                                <ExpenseForm onAdd={refreshTransactions} />
                            ) : (
                                <IncomeForm onAdd={refreshTransactions} />
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {filteredTransactions.length === 0 ? (
                            <div className="text-sm text-gray-400">Ni najdenih transakcij.</div>
                        ) : (
                            filteredTransactions.slice(0, 8).map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex flex-col gap-3 border-b border-[#f3f4f6] pb-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium">{tx.title}</div>

                                            <span
                                                className={`px-2 py-0.5 text-xs rounded-md font-medium ${tx.type === "Income"
                                                    ? "bg-green-100 text-green-700"
                                                    : tx.type === "Expense"
                                                        ? "bg-gray-100 text-gray-700"
                                                        : tx.type === "Subscription"
                                                            ? "bg-blue-100 text-blue-700"
                                                            : "bg-red-100 text-red-700"
                                                    }`}
                                            >
                                                {tx.type === "Income"
                                                    ? "Prihodek"
                                                    : tx.type === "Expense"
                                                        ? "Strošek"
                                                        : tx.type === "Subscription"
                                                            ? "Naročnina"
                                                            : "Dolg"}
                                            </span>
                                        </div>

                                        <div className="text-xs text-gray-500">{tx.date || "-"}</div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="text-sm font-semibold text-[#111827]">
                                            {tx.type === "Income" || (tx.type === "Debt" && tx.paid) ? "+" : "-"} €{formatAmount(tx.amount)}
                                        </div>

                                        <button
                                            onClick={() => handleStartEdit(tx)}
                                            className="text-xs text-gray-500 hover:text-[#111827]"
                                        >
                                            uredi
                                        </button>

                                        <button
                                            onClick={() => handleDelete(tx.id)}
                                            className="text-xs text-gray-400 hover:text-red-500"
                                        >
                                            izbriši
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="mb-4">
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="text-lg font-semibold tracking-tight">Naročnine</h2>

                            <div className="hidden lg:block">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const button = document.getElementById("subscription-submit-button");
                                        button?.click();
                                    }}
                                    className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                                >
                                    Dodaj
                                </button>
                            </div>
                        </div>

                        <p className="mt-1 text-sm text-gray-500">Mesečni ponavljajoči stroški</p>
                    </div>

                    <div className="mb-6">
                        <SubscriptionForm onAdd={refreshTransactions} />
                    </div>

                    <div className="mb-6 lg:hidden">
                        <button
                            type="button"
                            onClick={() => {
                                const button = document.getElementById("subscription-submit-button");
                                button?.click();
                            }}
                            className="w-full rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            Dodaj
                        </button>
                    </div>

                    <div className="space-y-4">
                        {transactions.filter((t) => t.type === "Subscription").length === 0 ? (
                            <div className="text-sm text-gray-400">Za zdaj še ni naročnin.</div>
                        ) : (
                            transactions
                                .filter((t) => t.type === "Subscription")
                                .map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="flex items-center justify-between gap-3 rounded-xl bg-[#fafafa] px-4 py-3"
                                    >
                                        <span className="min-w-0 text-sm">{tx.title}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">
                                                €{formatAmount(tx.amount)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleStartEdit(tx)}
                                                className="text-xs text-gray-500 hover:text-[#111827]"
                                            >
                                                uredi
                                            </button>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>

                    <div className="mt-6 border-t border-[#f0f0f0] pt-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Skupaj</span>
                            <span className="font-semibold">
                                €{formatAmount(
                                    transactions
                                        .filter((t) => t.type === "Subscription")
                                        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="mb-6">
                    <h2 className="text-lg font-semibold tracking-tight">Dolgovi</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Odprti dolgovi in spremljanje plačil.
                    </p>

                    <div className="mt-4">
                        <DebtForm onAdd={refreshTransactions} />
                    </div>
                </div>

                <div className="space-y-4">
                    {allDebtItems.length === 0 ? (
                        <div className="text-sm text-gray-400">Za zdaj še ni dolgov.</div>
                    ) : (
                        allDebtItems.map((tx) => (
                            <div
                                key={tx.id}
                                className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${tx.paid
                                    ? "border-[#e5e7eb] bg-[#f9fafb]"
                                    : "border-[#fecaca] bg-[#fef2f2]"
                                    }`}
                            >
                                <div>
                                    <div className="text-sm font-medium">{tx.title}</div>
                                    <div className="text-xs text-gray-400">
                                        {tx.date || "-"} · {tx.paid ? "Plačano" : "Odprto"}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="text-sm font-semibold">
                                        €{formatAmount(tx.amount)}
                                    </div>

                                    <button
                                        onClick={() => handleStartEdit(tx)}
                                        className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                    >
                                        Uredi
                                    </button>

                                    {tx.paid ? (
                                        <button
                                            onClick={() => handleMarkDebtOpen(tx.id)}
                                            className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                        >
                                            Označi kot odprto
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleMarkDebtPaid(tx.id)}
                                            className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                        >
                                            Označi kot plačano
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleDelete(tx.id)}
                                        className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-[#fef2f2]"
                                    >
                                        Izbriši
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {editingTransaction && (
                <EditTransactionForm
                    key={editingTransaction.id}
                    transaction={editingTransaction}
                    onCancel={() => setEditingTransaction(null)}
                    onSave={handleSaveEdit}
                />
            )}

        </>
    );
}
