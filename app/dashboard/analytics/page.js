"use client";

import { useMemo, useState } from "react";
import { getTransactions } from "../../../lib/storage";
import { getSettings } from "../../../lib/settings";
import { formatAmount } from "../../../lib/format";

function getMonthFromDate(dateValue) {
    if (!dateValue || typeof dateValue !== "string" || !dateValue.includes("-")) {
        return "";
    }

    return dateValue.slice(0, 7);
}

function getMonthLabel(monthValue) {
    if (!monthValue) return "";

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

function getPreviousMonth(monthValue) {
    const [year, month] = monthValue.split("-").map(Number);
    const prev = new Date(year, month - 2, 1);

    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function groupByMonth(transactions, recurringIncomeAmount = 0, recurringIncomeStartDate = "") {
    const months = {};

    transactions.forEach((transaction) => {
        if (!transaction.date || typeof transaction.date !== "string") return;

        const month = getMonthFromDate(transaction.date);
        if (!month) return;

        if (!months[month]) {
            months[month] = { income: 0, expense: 0 };
        }

        if (transaction.type === "Income") {
            months[month].income += Number(transaction.amount) || 0;
        } else if (transaction.type === "Debt" && transaction.paid) {
            const paidMonth = getMonthFromDate(transaction.paidAt) || month;

            if (!months[paidMonth]) {
                months[paidMonth] = { income: 0, expense: 0 };
            }

            months[paidMonth].income += Number(transaction.amount) || 0;
        } else if (
            transaction.type === "Expense" ||
            transaction.type === "Subscription" ||
            (transaction.type === "Debt" && !transaction.paid)
        ) {
            months[month].expense += Number(transaction.amount) || 0;
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

            if (triggerDate <= new Date()) {
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
            result: values.income - values.expense,
        }));
}

function average(items, getValue) {
    if (items.length === 0) return 0;

    return items.reduce((sum, item) => sum + getValue(item), 0) / items.length;
}

function percentChange(currentValue, previousValue) {
    if (!previousValue) {
        if (!currentValue) return 0;
        return 100;
    }

    return ((currentValue - previousValue) / previousValue) * 100;
}

function cardTone(value) {
    if (value > 0) return "text-[#166534]";
    if (value < 0) return "text-[#991b1b]";
    return "text-[#111827]";
}

function formatSignedCurrency(value) {
    return `${value > 0 ? "+" : value < 0 ? "-" : ""}€${formatAmount(Math.abs(value))}`;
}

function formatSignedPercent(value) {
    return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatAmount(Math.abs(value))}%`;
}

function sectionCardClasses(emphasis = "neutral") {
    if (emphasis === "good") {
        return "rounded-2xl border border-[#d9eadf] bg-[#f4fbf6] p-6";
    }

    if (emphasis === "bad") {
        return "rounded-2xl border border-[#f1d0d0] bg-[#fff6f6] p-6";
    }

    return "rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
}

function StatCard({ label, value, hint, tone = "neutral" }) {
    const toneClass =
        tone === "good"
            ? "text-[#166534]"
            : tone === "bad"
              ? "text-[#991b1b]"
              : "text-[#111827]";

    return (
        <div className={sectionCardClasses(tone)}>
            <div className="text-sm text-gray-500">{label}</div>
            <div className={`mt-3 text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
            <div className="mt-2 text-sm text-gray-500">{hint}</div>
        </div>
    );
}

export default function AnalyticsPage() {
    const [transactions] = useState(() => getTransactions());
    const [settings] = useState(() => getSettings());

    const analytics = useMemo(() => {
        const recurringIncomeAmount = Number(settings.recurringIncomeAmount) || 0;
        const recurringIncomeStartDate = settings.recurringIncomeStartDate || "";
        const monthlyData = groupByMonth(transactions, recurringIncomeAmount, recurringIncomeStartDate);
        const recentMonths = monthlyData.slice(-6);
        const currentMonth = new Date().toISOString().slice(0, 7);
        const previousMonth = getPreviousMonth(currentMonth);

        const currentMonthData = monthlyData.find((month) => month.month === currentMonth) || {
            month: currentMonth,
            income: 0,
            expense: 0,
            result: 0,
        };

        const previousMonthData = monthlyData.find((month) => month.month === previousMonth) || {
            month: previousMonth,
            income: 0,
            expense: 0,
            result: 0,
        };

        const currentMonthTransactions = transactions.filter(
            (transaction) => getMonthFromDate(transaction.date) === currentMonth
        );

        const previousMonthTransactions = transactions.filter(
            (transaction) => getMonthFromDate(transaction.date) === previousMonth
        );

        const expenseLikeTransactions = (items) =>
            items.filter(
                (transaction) =>
                    transaction.type === "Expense" ||
                    transaction.type === "Subscription" ||
                    (transaction.type === "Debt" && !transaction.paid)
            );

        const categoryTotals = (items) => {
            const totals = {};

            expenseLikeTransactions(items).forEach((transaction) => {
                const category = transaction.category || "Other";
                totals[category] = (totals[category] || 0) + (Number(transaction.amount) || 0);
            });

            return totals;
        };

        const currentCategoryTotals = categoryTotals(currentMonthTransactions);
        const previousCategoryTotals = categoryTotals(previousMonthTransactions);
        const currentExpenses = expenseLikeTransactions(currentMonthTransactions)
            .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

        const previousExpenses = expenseLikeTransactions(previousMonthTransactions)
            .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

        const categoryChanges = Object.keys({
            ...currentCategoryTotals,
            ...previousCategoryTotals,
        })
            .map((name) => {
                const currentValue = currentCategoryTotals[name] || 0;
                const previousValue = previousCategoryTotals[name] || 0;

                return {
                    name,
                    currentValue,
                    previousValue,
                    absoluteChange: currentValue - previousValue,
                    percentChangeValue: percentChange(currentValue, previousValue),
                    share: currentExpenses ? (currentValue / currentExpenses) * 100 : 0,
                };
            })
            .filter((item) => item.currentValue > 0 || item.previousValue > 0)
            .sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));

        const subscriptions = transactions.filter((transaction) => transaction.type === "Subscription");
        const monthlySubscriptions = subscriptions.reduce(
            (sum, transaction) => sum + (Number(transaction.amount) || 0),
            0
        );
        const annualSubscriptions = monthlySubscriptions * 12;

        const openDebts = transactions
            .filter((transaction) => transaction.type === "Debt" && !transaction.paid)
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

        const totalOpenDebt = openDebts.reduce(
            (sum, transaction) => sum + (Number(transaction.amount) || 0),
            0
        );

        const oldestOpenDebt = openDebts[0] || null;
        const largestOpenDebt = openDebts
            .slice()
            .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0] || null;

        const incomeOnlyCurrentMonth = currentMonthTransactions
            .filter((transaction) => transaction.type === "Income")
            .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

        const recurringIncomeThisMonth =
            recurringIncomeStartDate && currentMonth >= recurringIncomeStartDate.slice(0, 7)
                ? recurringIncomeAmount
                : 0;

        const oneOffIncomeShare =
            currentMonthData.income > 0 ? (incomeOnlyCurrentMonth / currentMonthData.income) * 100 : 0;

        const averageExpense = average(recentMonths, (month) => month.expense);
        const averageResult = average(recentMonths, (month) => month.result);
        const averageIncome = average(recentMonths, (month) => month.income);
        const averageExpenseLast3 = average(recentMonths.slice(-3), (month) => month.expense);
        const averageResultLast3 = average(recentMonths.slice(-3), (month) => month.result);

        const recentTrendWindow = recentMonths.slice(-4);
        const trendDelta =
            recentTrendWindow.length >= 2
                ? recentTrendWindow[recentTrendWindow.length - 1].result - recentTrendWindow[0].result
                : 0;

        const negativeMonths = recentMonths.filter((month) => month.result < 0).length;

        let negativeStreak = 0;
        for (let index = recentMonths.length - 1; index >= 0; index -= 1) {
            if (recentMonths[index].result < 0) {
                negativeStreak += 1;
            } else {
                break;
            }
        }

        const bestMonth = recentMonths
            .slice()
            .sort((a, b) => b.result - a.result)[0] || null;
        const worstMonth = recentMonths
            .slice()
            .sort((a, b) => a.result - b.result)[0] || null;

        const isOnOrAfterSnapshot = (dateValue) => {
            if (!settings.balanceSnapshotDate) return true;
            if (!dateValue) return true;
            return String(dateValue) >= String(settings.balanceSnapshotDate);
        };

        const recurringIncomeOverall = (() => {
            if (!settings.balanceSnapshotDate || !recurringIncomeStartDate || recurringIncomeAmount <= 0) {
                return 0;
            }

            const snapshot = new Date(settings.balanceSnapshotDate);
            const today = new Date();
            let count = 0;
            let cursor = recurringIncomeStartDate.slice(0, 7);
            const endMonth = currentMonth;

            while (cursor <= endMonth) {
                const triggerDate = getRecurringDateForMonth(cursor, recurringIncomeStartDate);

                if (triggerDate > snapshot && triggerDate <= today) {
                    count += 1;
                }

                cursor = getNextMonth(cursor);
            }

            return count * recurringIncomeAmount;
        })();

        const overallTransactionDelta = transactions.reduce((sum, transaction) => {
            const amount = Number(transaction.amount) || 0;

            if (transaction.type === "Income") {
                if (!isOnOrAfterSnapshot(transaction.date)) return sum;
                return sum + amount;
            }

            if (transaction.type === "Expense" || transaction.type === "Subscription") {
                if (!isOnOrAfterSnapshot(transaction.date)) return sum;
                return sum - amount;
            }

            if (transaction.type === "Debt") {
                if (transaction.paid) {
                    if (!isOnOrAfterSnapshot(transaction.paidAt || transaction.date)) return sum;
                    return sum + amount;
                }

                if (!isOnOrAfterSnapshot(transaction.date)) return sum;
                return sum - amount;
            }

            return sum;
        }, 0);

        const currentBalance =
            (Number(settings.startingBalance) || 0) + recurringIncomeOverall + overallTransactionDelta;

        const runwayMonths = averageExpenseLast3 > 0 ? currentBalance / averageExpenseLast3 : 0;
        const debtVsIncomeRatio =
            averageIncome > 0 ? (totalOpenDebt / averageIncome) * 100 : 0;
        const topCurrentExpense = expenseLikeTransactions(currentMonthTransactions)
            .slice()
            .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0] || null;

        const insights = [];

        if (negativeStreak >= 2) {
            insights.push(
                `${negativeStreak} zaporedn${negativeStreak > 1 ? "i meseci so" : "i mesec je"} bila negativna. Denarni tok potrebuje pozornost zdaj, ne kasneje.`
            );
        } else if (negativeMonths >= 3) {
            insights.push(
                `${negativeMonths} od zadnjih ${recentMonths.length} mesecev je bilo negativnih, zato trenutni vzorec ni posebej stabilen.`
            );
        }

        if (runwayMonths > 0 && runwayMonths < 3) {
            insights.push(
                `Pri trenutnem tempu stroškov tvoje trenutno stanje pokrije približno ${formatAmount(runwayMonths)} meseca.`
            );
        } else if (runwayMonths >= 3 && runwayMonths < 6) {
            insights.push(
                `Tvoje stanje pokrije približno ${formatAmount(runwayMonths)} meseca povprečnih zadnjih stroškov, kar je uporabno, ni pa posebej udobno.`
            );
        }

        if (categoryChanges[0] && categoryChanges[0].absoluteChange > 0) {
            insights.push(
                `Kategorija ${categoryChanges[0].name} se je glede na prejšnji mesec najbolj premaknila: ${formatSignedCurrency(categoryChanges[0].absoluteChange)}.`
            );
        }

        if (annualSubscriptions > 0) {
            insights.push(
                `Naročnine skupaj znašajo €${formatAmount(monthlySubscriptions)} na mesec, kar je €${formatAmount(annualSubscriptions)} na leto.`
            );
        }

        if (totalOpenDebt > 0) {
            insights.push(
                `Odprti dolg znaša €${formatAmount(totalOpenDebt)}${largestOpenDebt ? `, največji pa je ${largestOpenDebt.title} v višini €${formatAmount(largestOpenDebt.amount)}` : ""}.`
            );
        }

        if (currentMonthData.income > 0 && oneOffIncomeShare >= 40) {
            insights.push(
                `${formatAmount(oneOffIncomeShare)}% prihodkov tega meseca je prišlo iz enkratnih vnosov, ne iz rednih prihodkov.`
            );
        }

        if (topCurrentExpense && currentExpenses > 0) {
            const topExpenseShare = (Number(topCurrentExpense.amount) / currentExpenses) * 100;

            if (topExpenseShare >= 25) {
                insights.push(
                    `${topCurrentExpense.title} sam predstavlja ${formatAmount(topExpenseShare)}% stroškov tega meseca.`
                );
            }
        }

        if (insights.length === 0) {
            insights.push("Za bolj uporabne vzorce tukaj potrebuješ še malo več mesečnih podatkov.");
        }

        return {
            currentMonth,
            previousMonth,
            currentMonthData,
            previousMonthData,
            averageIncome,
            averageExpense,
            averageResult,
            averageExpenseLast3,
            averageResultLast3,
            trendDelta,
            negativeMonths,
            negativeStreak,
            bestMonth,
            worstMonth,
            currentBalance,
            runwayMonths,
            debtVsIncomeRatio,
            totalOpenDebt,
            openDebts,
            oldestOpenDebt,
            largestOpenDebt,
            monthlySubscriptions,
            annualSubscriptions,
            subscriptions,
            oneOffIncomeShare,
            recurringIncomeThisMonth,
            incomeOnlyCurrentMonth,
            categoryChanges,
            currentExpenses,
            previousExpenses,
            recentMonths,
            insights,
        };
    }, [settings, transactions]);

    const {
        currentMonth,
        previousMonth,
        currentMonthData,
        previousMonthData,
        averageIncome,
        averageExpense,
        averageResult,
        averageExpenseLast3,
        averageResultLast3,
        trendDelta,
        negativeMonths,
        negativeStreak,
        bestMonth,
        worstMonth,
        currentBalance,
        runwayMonths,
        debtVsIncomeRatio,
        totalOpenDebt,
        openDebts,
        oldestOpenDebt,
        largestOpenDebt,
        monthlySubscriptions,
        annualSubscriptions,
        subscriptions,
        oneOffIncomeShare,
        recurringIncomeThisMonth,
        incomeOnlyCurrentMonth,
        categoryChanges,
        currentExpenses,
        previousExpenses,
        recentMonths,
        insights,
    } = analytics;

    const healthTone =
        currentMonthData.result > 0 ? "good" : currentMonthData.result < 0 ? "bad" : "neutral";

    const savingsRate =
        currentMonthData.income > 0 ? (currentMonthData.result / currentMonthData.income) * 100 : 0;

    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-semibold tracking-tight">Analitika</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-500">
                    Praktičen pregled denarnega toka, obremenitev in sprememb med{" "}
                    {getMonthLabel(previousMonth)} in {getMonthLabel(currentMonth)}.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
                <StatCard
                    label="Rezultat tega meseca"
                    value={formatSignedCurrency(currentMonthData.result)}
                    hint={`${getMonthLabel(currentMonth)}: prihodki minus stroški`}
                    tone={healthTone}
                />
                <StatCard
                    label="Stopnja prihranka"
                    value={formatSignedPercent(savingsRate)}
                    hint="Kolikšen del prihodkov tega meseca ti je ostal"
                    tone={savingsRate > 0 ? "good" : savingsRate < 0 ? "bad" : "neutral"}
                />
                <StatCard
                    label="Trenutno stanje"
                    value={`€${formatAmount(currentBalance)}`}
                    hint="Začetno stanje plus spremembe od snapshot datuma"
                    tone={currentBalance > 0 ? "good" : currentBalance < 0 ? "bad" : "neutral"}
                />
                <StatCard
                    label="Finančna rezerva"
                    value={runwayMonths > 0 ? `${formatAmount(runwayMonths)} mo` : "n/a"}
                    hint="Trenutno stanje deljeno s povprečnimi stroški zadnjih 3 mesecev"
                    tone={runwayMonths >= 6 ? "good" : runwayMonths > 0 && runwayMonths < 3 ? "bad" : "neutral"}
                />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className={sectionCardClasses()}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Finančno zdravje</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Cilj tega dela je pokazati, ali se stanje izboljšuje, stoji na mestu ali postaja bolj napeto.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Trend</div>
                            <div className={`mt-2 text-2xl font-semibold ${cardTone(trendDelta)}`}>
                                {trendDelta > 0 ? "Izboljšanje" : trendDelta < 0 ? "Poslabšanje" : "Brez večje spremembe"}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                                Rezultat se je v zadnjem 4-mesečnem obdobju premaknil za {formatSignedCurrency(trendDelta)}.
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Povprečni denarni tok</div>
                            <div className={`mt-2 text-2xl font-semibold ${cardTone(averageResultLast3)}`}>
                                {formatSignedCurrency(averageResultLast3)}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                                Povprečni mesečni rezultat v zadnjih 3 mesecih.
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Negativni meseci</div>
                            <div className="mt-2 text-2xl font-semibold text-[#111827]">
                                {negativeMonths} / {recentMonths.length || 0}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                                {negativeStreak > 0
                                    ? `Trenutno je negativnih ${negativeStreak} zaporednih ${negativeStreak > 1 ? "mesecev" : "mesec"}.`
                                    : "Trenutno ni aktivnega negativnega niza."}
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Kakovost prihodkov</div>
                            <div className="mt-2 text-2xl font-semibold text-[#111827]">
                                {formatAmount(oneOffIncomeShare)}% enkratnih
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                                Redni prihodki ta mesec: €{formatAmount(recurringIncomeThisMonth)}. Enkratni prihodki: €{formatAmount(incomeOnlyCurrentMonth)}.
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-[#eceff3] px-4 py-4">
                            <div className="text-xs text-gray-400">Povprečni prihodki v 6 mesecih</div>
                            <div className="mt-2 text-lg font-semibold">€{formatAmount(averageIncome)}</div>
                        </div>
                        <div className="rounded-xl border border-[#eceff3] px-4 py-4">
                            <div className="text-xs text-gray-400">Povprečni stroški v 6 mesecih</div>
                            <div className="mt-2 text-lg font-semibold">€{formatAmount(averageExpense)}</div>
                        </div>
                        <div className="rounded-xl border border-[#eceff3] px-4 py-4">
                            <div className="text-xs text-gray-400">Povprečni stroški v 3 mesecih</div>
                            <div className="mt-2 text-lg font-semibold">€{formatAmount(averageExpenseLast3)}</div>
                        </div>
                    </div>
                </div>

                <div className={sectionCardClasses(openDebts.length > 0 ? "bad" : "good")}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Glavne obremenitve</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Stalne obveznosti so pomembnejše od posameznih izoliranih številk.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-xl bg-white/70 px-4 py-4">
                            <div className="text-xs text-gray-400">Odprti dolg</div>
                            <div className="mt-2 text-2xl font-semibold">€{formatAmount(totalOpenDebt)}</div>
                            <div className="mt-1 text-sm text-gray-500">
                                {openDebts.length} odprt{openDebts.length === 1 ? "a postavka" : openDebts.length >= 2 && openDebts.length <= 4 ? "e postavke" : "ih postavk"}.
                            </div>
                        </div>

                        <div className="rounded-xl bg-white/70 px-4 py-4">
                            <div className="text-xs text-gray-400">Dolg glede na povprečne prihodke</div>
                            <div className="mt-2 text-2xl font-semibold">{formatAmount(debtVsIncomeRatio)}%</div>
                            <div className="mt-1 text-sm text-gray-500">
                                Odprti dolg kot delež tvojih povprečnih mesečnih prihodkov.
                            </div>
                        </div>

                        <div className="rounded-xl bg-white/70 px-4 py-4">
                            <div className="text-xs text-gray-400">Naročnine</div>
                            <div className="mt-2 text-2xl font-semibold">€{formatAmount(annualSubscriptions)}</div>
                            <div className="mt-1 text-sm text-gray-500">
                                {subscriptions.length} aktivn{subscriptions.length === 1 ? "a naročnina" : subscriptions.length >= 2 && subscriptions.length <= 4 ? "e naročnine" : "ih naročnin"} v vrednosti €{formatAmount(monthlySubscriptions)}/mesec.
                            </div>
                        </div>

                        <div className="rounded-xl bg-white/70 px-4 py-4 text-sm text-gray-600">
                            <div>
                                Največji odprti dolg:{" "}
                                <span className="font-medium text-[#111827]">
                                    {largestOpenDebt
                                        ? `${largestOpenDebt.title} · €${formatAmount(largestOpenDebt.amount)}`
                                        : "Ni"}
                                </span>
                            </div>
                            <div className="mt-2">
                                Najstarejši odprti dolg:{" "}
                                <span className="font-medium text-[#111827]">
                                    {oldestOpenDebt
                                        ? `${oldestOpenDebt.title} · ${oldestOpenDebt.date || "Brez datuma"}`
                                        : "Ni"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className={sectionCardClasses()}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Kaj se je spremenilo ta mesec</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Primerjava med {getMonthLabel(currentMonth)} in {getMonthLabel(previousMonth)}.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Sprememba prihodkov</div>
                            <div className={`mt-2 text-xl font-semibold ${cardTone(currentMonthData.income - previousMonthData.income)}`}>
                                {formatSignedCurrency(currentMonthData.income - previousMonthData.income)}
                            </div>
                        </div>
                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Sprememba stroškov</div>
                            <div className={`mt-2 text-xl font-semibold ${cardTone(previousMonthData.expense - currentMonthData.expense)}`}>
                                {formatSignedCurrency(currentMonthData.expense - previousMonthData.expense)}
                            </div>
                        </div>
                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Sprememba rezultata</div>
                            <div className={`mt-2 text-xl font-semibold ${cardTone(currentMonthData.result - previousMonthData.result)}`}>
                                {formatSignedCurrency(currentMonthData.result - previousMonthData.result)}
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {categoryChanges.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[#d7dbe3] px-4 py-4 text-sm text-gray-500">
                                Za zdaj še ni premikov po kategorijah. Dodaj več kategoriziranih stroškov, da bo ta del bolj uporaben.
                            </div>
                        ) : (
                            categoryChanges.slice(0, 4).map((item) => (
                                <div
                                    key={item.name}
                                    className="rounded-xl border border-[#eceff3] px-4 py-4"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium text-[#111827]">{item.name}</div>
                                            <div className="mt-1 text-sm text-gray-500">
                                                Zdaj €{formatAmount(item.currentValue)} proti €{formatAmount(item.previousValue)} prejšnji mesec
                                            </div>
                                        </div>
                                        <div className={`text-sm font-semibold ${cardTone(-item.absoluteChange)}`}>
                                            {formatSignedCurrency(item.absoluteChange)}
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                                        <span>{formatSignedPercent(item.percentChangeValue)}</span>
                                        <span>{formatAmount(item.share)}% trenutnih stroškov</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className={sectionCardClasses()}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Ključni poudarki</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Kratki poudarki, ki povedo, čemu je smiselno najprej posvetiti pozornost.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {insights.map((insight, index) => (
                            <div
                                key={index}
                                className="rounded-xl border border-[#eceff3] bg-[#fafafa] px-4 py-4 text-sm leading-6 text-gray-700"
                            >
                                {insight}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <div className={sectionCardClasses()}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Mesečna slika</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Najbolj uporaben del za občutek, ali so slabi meseci izjema ali postajajo pravilo.
                        </p>
                    </div>

                    {recentMonths.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#d7dbe3] px-4 py-4 text-sm text-gray-500">
                            Za zdaj še ni mesečnih podatkov.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentMonths.map((month) => {
                                const resultTone = month.result > 0 ? "bg-[#e9f7ee]" : month.result < 0 ? "bg-[#fff0f0]" : "bg-[#f3f4f6]";
                                const barWidth = averageExpenseLast3 > 0
                                    ? Math.min((Math.abs(month.result) / averageExpenseLast3) * 100, 100)
                                    : 0;

                                return (
                                    <div
                                        key={month.month}
                                        className="rounded-xl border border-[#eceff3] px-4 py-4"
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-sm font-medium">{getMonthLabel(month.month)}</div>
                                                <div className="mt-1 text-sm text-gray-500">
                                                    Prihodki €{formatAmount(month.income)} · Stroški €{formatAmount(month.expense)}
                                                </div>
                                            </div>
                                            <div className={`rounded-full px-3 py-1 text-sm font-medium ${resultTone} ${cardTone(month.result)}`}>
                                                {formatSignedCurrency(month.result)}
                                            </div>
                                        </div>

                                        <div className="mt-3 h-2 rounded-full bg-[#f3f4f6]">
                                            <div
                                                className={`h-2 rounded-full ${month.result >= 0 ? "bg-[#166534]" : "bg-[#991b1b]"}`}
                                                style={{ width: `${Math.max(barWidth, 4)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className={sectionCardClasses()}>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Orientacijske točke</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Hiter kontekst, ne samo ena izolirana številka.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Najboljši mesec v zadnjih podatkih</div>
                            <div className="mt-2 text-lg font-semibold">
                                {bestMonth ? `${getMonthLabel(bestMonth.month)} · ${formatSignedCurrency(bestMonth.result)}` : "ni podatka"}
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Najslabši mesec v zadnjih podatkih</div>
                            <div className="mt-2 text-lg font-semibold">
                                {worstMonth ? `${getMonthLabel(worstMonth.month)} · ${formatSignedCurrency(worstMonth.result)}` : "ni podatka"}
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Stroški tega meseca</div>
                            <div className="mt-2 text-lg font-semibold">€{formatAmount(currentExpenses)}</div>
                            <div className="mt-1 text-sm text-gray-500">
                                Prejšnji mesec: €{formatAmount(previousExpenses)}
                            </div>
                        </div>

                        <div className="rounded-xl bg-[#fafafa] px-4 py-4">
                            <div className="text-xs text-gray-400">Povprečni zadnji mesečni rezultat</div>
                            <div className={`mt-2 text-lg font-semibold ${cardTone(averageResult)}`}>
                                {formatSignedCurrency(averageResult)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
