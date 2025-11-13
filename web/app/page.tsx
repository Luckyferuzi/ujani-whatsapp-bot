import Link from "next/link";

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Ujani</h1>
      <p className="text-ui-dim">
        Open the{" "}
        <Link className="text-ui-primary underline" href="/inbox">
          Inbox
        </Link>
        .
      </p>
    </div>
  );
}
