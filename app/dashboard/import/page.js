"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { saveManyTransactions } from "../../../lib/storage";
import { formatAmount } from "../../../lib/format";
import { useToast } from "../../../components/toast-provider";

function normalizeExcelDate(value) {
    if (!value) return "";

    if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return "";

        const year = parsed.y;
        const month = String(parsed.m).padStart(2, "0");
        const day = String(parsed.d).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    if (typeof value === "string") {
        if (value.includes("-")) return value.trim();

        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, "0");
            const day = String(parsed.getDate()).padStart(2, "0");

            return `${year}-${month}-${day}`;
        }
    }

    return "";
}

function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") return 0;

    if (typeof value === "number") return Number(value.toFixed(2));

    const cleaned = String(value)
        .replace("€", "")
        .replace(/\s/g, "")
        .replace(",", ".");

    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

function detectType(categoryValue, explicitType) {
    if (explicitType) return explicitType;

    const category = String(categoryValue || "").trim().toLowerCase();

    if (category === "dolgovi") return "Debt";
    if (category === "subscriptions") return "Subscription";

    return "Expense";
}

function mapImportedRows(json) {
    return json.map((row) => {
        const category =
            row.category ||
            row.Category ||
            row.kategorija ||
            row.Kategorija ||
            "Other";

        const explicitType =
            row.type ||
            row.Type ||
            row.tip ||
            row.Tip ||
            "";

        return {
            title:
                row.title ||
                row.Title ||
                row.opis ||
                row.Opis ||
                row.description ||
                row.Description ||
                row.name ||
                row.Name ||
                "",
            amount: normalizeAmount(
                row["Amount (€)"] ||
                row.amount ||
                row.Amount ||
                row.znesek ||
                row.Znesek ||
                row.value ||
                row.Value ||
                0
            ),
            date: normalizeExcelDate(
                row.date ||
                row.Date ||
                row.datum ||
                row.Datum ||
                row.created_at ||
                row.Created_at ||
                ""
            ),
            type: detectType(category, explicitType),
            category,
            note:
                row.note ||
                row.Note ||
                row.opomba ||
                row.Opomba ||
                row.user ||
                row.User ||
                "",
        };
    });
}

export default function ImportPage() {
    const router = useRouter();
    const { showToast } = useToast();
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState("");

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
            type: "array",
            raw: false,
        });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const mapped = mapImportedRows(json);
        setRows(mapped);
    };

    const handleImport = () => {
        if (rows.length === 0) return;

        const result = saveManyTransactions(rows);
        showToast(
            `Uvoženih: ${result.imported}. Preskočenih duplikatov: ${result.skipped}.`,
            "success"
        );

        router.push("/dashboard/transactions");
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-semibold tracking-tight">Uvoz datoteke</h1>
                <p className="mt-2 text-sm text-gray-500">
                    Naloži CSV ali Excel datoteko in uvozi transakcije v nadzorno ploščo.
                </p>
            </div>

            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
                <div className="mb-6">
                    <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFile}
                        className="block w-full text-sm"
                    />
                    <div className="mt-2 text-xs text-gray-400">
                        Podprto: Costify CSV, CSV, XLSX, XLS
                    </div>
                </div>

                {fileName && (
                    <div className="mb-4 text-sm text-gray-500">
                        Datoteka: {fileName}
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        <div className="mb-4 text-sm text-gray-500">
                            Predogled: najdenih {rows.length} vrstic
                        </div>

                        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#e5e7eb]">
                            <div className="grid grid-cols-5 border-b border-[#f3f4f6] bg-[#fafafa] px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 sticky top-0">
                                <div>Naslov</div>
                                <div>Datum</div>
                                <div>Tip</div>
                                <div>Kategorija</div>
                                <div>Znesek</div>
                            </div>

                            {rows.map((row, index) => (
                                <div
                                    key={index}
                                    className="grid grid-cols-5 border-b border-[#f3f4f6] px-4 py-3 text-sm last:border-b-0"
                                >
                                    <div>{row.title}</div>
                                    <div>{row.date}</div>
                                    <div>{row.type}</div>
                                    <div>{row.category}</div>
                                    <div>€{formatAmount(row.amount)}</div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex items-center gap-3">
                            <button
                                onClick={handleImport}
                                className="rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white"
                            >
                                Uvozi transakcije
                            </button>

                            <button
                                onClick={() => router.push("/dashboard")}
                                className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-gray-600"
                            >
                                Prekliči
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
