import Sidebar from "../../components/sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#111827]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
