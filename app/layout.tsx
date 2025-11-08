export const metadata = {
  title: "Plumbing Attendance Agent",
  description: "Track contractors, laborers, attendance, and totals",
};

import "../styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
