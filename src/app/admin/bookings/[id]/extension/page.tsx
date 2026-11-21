import ExtensionClient from "./extension-client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ExtensionClient id={(await params).id} />;
}
