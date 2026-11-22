import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function FinanceLoading() {
  return <div className="flex min-h-96 items-center justify-center"><LoadingAnimation size="large" label="Loading Finance dashboard" /></div>;
}
