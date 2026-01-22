// web/app/profile/layout.tsx
import "./profile.css";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="profile-root">{children}</div>;
}
