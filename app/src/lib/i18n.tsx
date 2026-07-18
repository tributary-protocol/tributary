import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "en" | "vi";

const translations = {
  en: {
    // Header & Navigation
    connectWallet: "Connect Freighter",
    github: "GitHub",
    testnet: "Testnet",
    // Intro
    introTitle: "Split payments on Stellar",
    introDesc: "One transaction in, every recipient paid by their share. Running on testnet.",
    // ActionPanel tabs
    tabCreate: "Create",
    tabPay: "Pay",
    tabEscrow: "Escrow",
    tabManage: "Manage",
    // CreateSplit
    createTitle: "Create a split",
    createEditableLabel: "I can edit this split later (uncheck to lock it forever)",
    createButton: "Create split",
    waitingForSignature: "Waiting for signature…",
    connectWalletFirst: "Connect your wallet first.",
    splitCreated: "Split #{id} created.",
    contractRejectedSplit: "Contract rejected the split.",
    // RecipientEditor
    sharesTotalError: "Shares must add up to 100%.",
    sharesGreaterZeroError: "Shares must be greater than zero.",
    recipientRequiredError: "Every recipient needs an address or split id.",
    recipientFormatError: "Recipient addresses must be G… account keys.",
    kindAddress: "Address",
    kindSplit: "Split",
    placeholderAddress: "G… recipient address",
    placeholderSplit: "Split id",
    addRecipient: "Add recipient",
    pctOfTotal: "{pct}% of 100%",
    // PaySplit
    payTitle: "Pay through a split",
    chooseSplit: "Choose split",
    recipientsCount: "{count} recipients",
    amount: "Amount",
    paySuccess: "Paid {amount} {token} through split #{id}.",
    payFailed: "Payment failed.",
    payButton: "Pay",
    pickSplitAndAmount: "Pick a split and an amount.",
    // EscrowCard
    escrowTitle: "Escrow",
    escrowDesc: "Park funds in a split now, pay everyone out later.",
    pending: "Pending: {amount} {token}",
    depositButton: "Deposit",
    distributeButton: "Distribute",
    distributeSuccess: "Distributed {amount} {token} to all recipients.",
    distributeFailed: "Nothing to distribute.",
    depositSuccess: "Deposited {amount} {token}.",
    depositFailed: "Deposit failed.",
    pickSplit: "Pick a split.",
    working: "Working…",
    // ManageSplit
    manageTitle: "Manage your splits",
    chooseSplitControl: "Choose split you control",
    updateButton: "Update split",
    placeholderController: "G… new controller",
    transferButton: "Transfer",
    lockButton: "Lock forever",
    confirmLockButton: "Confirm lock",
    updateSuccess: "Split updated.",
    updateFailed: "Update rejected.",
    transferSuccess: "Control transferred.",
    transferFailed: "Transfer rejected.",
    lockConfirmPrompt: "Locking is permanent. Press again to confirm.",
    lockSuccess: "Split locked forever.",
    lockFailed: "Lock rejected.",
    controllerFormatError: "Controller must be a G… account key.",
    // SplitList & Detail
    loadingSplits: "Loading splits…",
    noSplitsOnContract: "No splits on this contract yet.",
    noSplitsPrompt: "Connect Freighter on testnet, open the Create tab and register the first one. Testnet XLM is free from friendbot, so it costs nothing to try.",
    recentSplits: "Recent splits",
    copy: "Copy",
    yours: "yours",
    mutable: "mutable",
    locked: "locked",
    nestedSplit: "split #{id}",
    detailEscrow: "escrow",
    detailController: "controller: {controller}",
    // Activity
    recentActivity: "Recent activity",
    exportCsv: "Export CSV",
    activityCreated: "created",
    activityPaid: "paid",
    activityUpdated: "updated",
    activityDeposit: "deposit",
    activityDistributed: "distributed",
    activityControlMoved: "control moved",
    activityTx: "tx",
    activitySplitNum: "split #{id}",
    // Footer
    contractOnTestnet: "Contract on testnet",
  },
  vi: {
    // Header & Navigation
    connectWallet: "Kết nối Freighter",
    github: "GitHub",
    testnet: "Testnet",
    // Intro
    introTitle: "Chia nhỏ thanh toán trên Stellar",
    introDesc: "Một giao dịch duy nhất, mọi người nhận đều được thanh toán theo tỷ lệ của họ. Chạy trên mạng thử nghiệm (testnet).",
    // ActionPanel tabs
    tabCreate: "Tạo",
    tabPay: "Thanh toán",
    tabEscrow: "Ký quỹ",
    tabManage: "Quản lý",
    // CreateSplit
    createTitle: "Tạo một danh sách chia",
    createEditableLabel: "Tôi có thể chỉnh sửa danh sách chia này sau (bỏ chọn để khóa vĩnh viễn)",
    createButton: "Tạo danh sách chia",
    waitingForSignature: "Đang chờ chữ ký…",
    connectWalletFirst: "Vui lòng kết nối ví của bạn trước.",
    splitCreated: "Danh sách chia #{id} đã được tạo.",
    contractRejectedSplit: "Hợp đồng đã từ chối danh sách chia.",
    // RecipientEditor
    sharesTotalError: "Tổng tỷ lệ chia phải bằng 100%.",
    sharesGreaterZeroError: "Tỷ lệ chia phải lớn hơn không.",
    recipientRequiredError: "Mỗi người nhận cần có một địa chỉ hoặc mã danh sách chia.",
    recipientFormatError: "Địa chỉ người nhận phải là khóa tài khoản bắt đầu bằng G….",
    kindAddress: "Địa chỉ",
    kindSplit: "Danh sách chia",
    placeholderAddress: "Địa chỉ người nhận bắt đầu bằng G…",
    placeholderSplit: "Mã danh sách chia",
    addRecipient: "Thêm người nhận",
    pctOfTotal: "{pct}% của 100%",
    // PaySplit
    payTitle: "Thanh toán qua danh sách chia",
    chooseSplit: "Chọn danh sách chia",
    recipientsCount: "{count} người nhận",
    amount: "Số lượng",
    paySuccess: "Đã thanh toán {amount} {token} qua danh sách chia #{id}.",
    payFailed: "Thanh toán thất bại.",
    payButton: "Thanh toán",
    pickSplitAndAmount: "Hãy chọn một danh sách chia và số lượng.",
    // EscrowCard
    escrowTitle: "Ký quỹ",
    escrowDesc: "Gửi tiền vào một danh sách chia bây giờ, thanh toán cho mọi người sau.",
    pending: "Đang chờ xử lý: {amount} {token}",
    depositButton: "Nạp tiền",
    distributeButton: "Phân phối",
    distributeSuccess: "Đã phân phối {amount} {token} đến tất cả người nhận.",
    distributeFailed: "Không có gì để phân phối.",
    depositSuccess: "Đã nạp {amount} {token}.",
    depositFailed: "Nạp tiền thất bại.",
    pickSplit: "Hãy chọn một danh sách chia.",
    working: "Đang xử lý…",
    // ManageSplit
    manageTitle: "Quản lý danh sách chia của bạn",
    chooseSplitControl: "Chọn danh sách chia bạn kiểm soát",
    updateButton: "Cập nhật danh sách chia",
    placeholderController: "Địa chỉ bộ điều khiển mới bắt đầu bằng G…",
    transferButton: "Chuyển quyền",
    lockButton: "Khóa vĩnh viễn",
    confirmLockButton: "Xác nhận khóa",
    updateSuccess: "Danh sách chia đã được cập nhật.",
    updateFailed: "Cập nhật bị từ chối.",
    transferSuccess: "Đã chuyển quyền điều khiển.",
    transferFailed: "Chuyển quyền bị từ chối.",
    lockConfirmPrompt: "Khóa là vĩnh viễn. Nhấn lại một lần nữa để xác nhận.",
    lockSuccess: "Danh sách chia đã bị khóa vĩnh viễn.",
    lockFailed: "Khóa bị từ chối.",
    controllerFormatError: "Bộ điều khiển phải là khóa tài khoản bắt đầu bằng G….",
    // SplitList & Detail
    loadingSplits: "Đang tải các danh sách chia…",
    noSplitsOnContract: "Chưa có danh sách chia nào trên hợp đồng này.",
    noSplitsPrompt: "Kết nối ví Freighter trên testnet, mở thẻ Tạo và đăng ký danh sách chia đầu tiên. XLM testnet được cấp miễn phí từ friendbot, do đó bạn không mất phí để thử nghiệm.",
    recentSplits: "Danh sách chia gần đây",
    copy: "Sao chép",
    yours: "của bạn",
    mutable: "có thể sửa",
    locked: "đã khóa",
    nestedSplit: "danh sách chia #{id}",
    detailEscrow: "ký quỹ",
    detailController: "bộ điều khiển: {controller}",
    // Activity
    recentActivity: "Hoạt động gần đây",
    exportCsv: "Xuất CSV",
    activityCreated: "đã tạo",
    activityPaid: "đã thanh toán",
    activityUpdated: "đã cập nhật",
    activityDeposit: "nạp tiền",
    activityDistributed: "đã phân phối",
    activityControlMoved: "đã chuyển quyền",
    activityTx: "tx",
    activitySplitNum: "danh sách chia #{id}",
    // Footer
    contractOnTestnet: "Hợp đồng trên testnet",
  },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("tributary-lang");
    return (saved === "vi" || saved === "en") ? saved : "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("tributary-lang", lang);
  };

  const t = (key: string, variables?: Record<string, string | number>): string => {
    const dict = translations[language] || translations["en"];
    let text = dict[key as keyof typeof dict] || key;
    if (variables) {
      Object.entries(variables).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
