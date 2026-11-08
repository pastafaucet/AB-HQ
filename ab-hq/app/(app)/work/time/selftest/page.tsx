import SelfTestClient from "./SelfTestClient";

export const metadata = { title: "Hours self-test · AB HQ" };
export const dynamic = "force-dynamic";

export default function SelfTestPage() {
  return <SelfTestClient />;
}
