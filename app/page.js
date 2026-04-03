"use client";
import { useEffect, useState } from "react";
import { getTransactions } from "../../lib/storage";
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}