import { MobileHeader } from "@/components/mobile/mobile-header";
import { StockTakeView } from "./stocktake-view";

export const dynamic = "force-dynamic";

export default function StockTakePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader title="Stock take" backHref="/mobile" />
      <StockTakeView />
    </div>
  );
}
