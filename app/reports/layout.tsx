import TopNav from "../components/top-nav";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav title="UDITO" />
      {children}
    </>
  );
}
