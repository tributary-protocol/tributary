import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "en" | "vi" | "it" | "tr";

export const LANGUAGE_STORAGE_KEY = "tributary-lang";

export function readSavedLanguage(): Language {
  if (typeof localStorage === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === "vi" || saved === "it" || saved === "tr" || saved === "en" ? saved : "en";
}

export function persistLanguage(lang: Language) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

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
    trustlineWarningTitle: "Cannot pay in {token}",
    trustlineWarningItem: "{address} has no {token} trustline. They must add it before this split can be paid in {token}.",
    trustlineWarningHint: "The payment is blocked until all recipients can receive this token.",
    trustlineNoticeTitle: "Trustline check inconclusive",
    trustlineNoticeHint: "Could not verify trustlines for some recipients. The payment may fail if they cannot receive this token.",
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
    detailHistoryTitle: "Payment & Distribution History",
    detailHistoryEmpty: "No payments or distributions yet.",
    detailHistoryLoading: "Loading history…",
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
    // FeeHint
    estimatedFee: "Estimated fee",
    estimatedDepositFee: "Estimated deposit fee",
    estimatedDistributeFee: "Estimated distribute fee",
    estimatedUpdateFee: "Estimated update fee",
    estimatedTransferFee: "Estimated transfer fee",
    estimatedLockFee: "Estimated lock fee",
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
    trustlineWarningTitle: "Không thể thanh toán bằng {token}",
    trustlineWarningItem: "{address} chưa có trustline cho {token}. Họ phải thêm trustline trước khi danh sách chia này có thể được thanh toán bằng {token}.",
    trustlineWarningHint: "Thanh toán bị chặn cho đến khi tất cả người nhận có thể nhận được token này.",
    trustlineNoticeTitle: "Không thể xác minh trustline",
    trustlineNoticeHint: "Không thể xác minh trustline cho một số người nhận. Thanh toán có thể thất bại nếu họ không thể nhận token này.",
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
    detailHistoryTitle: "Lịch sử thanh toán & phân phối",
    detailHistoryEmpty: "Chưa có thanh toán hoặc phân phối nào.",
    detailHistoryLoading: "Đang tải lịch sử…",
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
    // FeeHint
    estimatedFee: "Phí ước tính",
    estimatedDepositFee: "Phí ký quỹ ước tính",
    estimatedDistributeFee: "Phí phân phối ước tính",
    estimatedUpdateFee: "Phí cập nhật ước tính",
    estimatedTransferFee: "Phí chuyển quyền ước tính",
    estimatedLockFee: "Phí khóa ước tính",
    // Footer
    contractOnTestnet: "Contract on testnet",
  },
  ru: {
    // Header & Navigation
    connectWallet: "Подключить Freighter",
    github: "GitHub",
    testnet: "Тестнет",
    // Intro
    introTitle: "Разделение платежей в Stellar",
    introDesc: "Одна транзакция на входе, каждый получатель получает свою долю. Работает в тестнете.",
    // ActionPanel tabs
    tabCreate: "Создать",
    tabPay: "Оплатить",
    tabEscrow: "Эскроу",
    tabManage: "Управление",
    // CreateSplit
    createTitle: "Создать разделение",
    createEditableLabel: "Я смогу редактировать это разделение позже (снимите галочку, чтобы зафиксировать навсегда)",
    createButton: "Создать разделение",
    waitingForSignature: "Ожидание подписи…",
    connectWalletFirst: "Сначала подключите кошелёк.",
    splitCreated: "Разделение #{id} создано.",
    contractRejectedSplit: "Контракт отклонил разделение.",
    // RecipientEditor
    sharesTotalError: "Доли должны суммироваться до 100%.",
    sharesGreaterZeroError: "Доли должны быть больше нуля.",
    recipientRequiredError: "У каждого получателя должен быть адрес или ID разделения.",
    recipientFormatError: "Адреса получателей должны быть ключами аккаунтов G….",
    kindAddress: "Адрес",
    kindSplit: "Разделение",
    placeholderAddress: "G… адрес получателя",
    placeholderSplit: "ID разделения",
    addRecipient: "Добавить получателя",
    pctOfTotal: "{pct}% из 100%",
    // PaySplit
    payTitle: "Оплатить через разделение",
    chooseSplit: "Выберите разделение",
    recipientsCount: "{count} получателей",
    amount: "Сумма",
    paySuccess: "Оплачено {amount} {token} через разделение #{id}.",
    payFailed: "Платёж не прошёл.",
    payButton: "Оплатить",
    pickSplitAndAmount: "Выберите разделение и сумму.",
    // EscrowCard
    escrowTitle: "Эскроу",
    escrowDesc: "Закройте средства сейчас, выплатите всем позже.",
    pending: "В ожидании: {amount} {token}",
    depositButton: "Депозит",
    distributeButton: "Выплатить",
    distributeSuccess: "Выплачено {amount} {token} всем получателям.",
    distributeFailed: "Нечего выплачивать.",
    depositSuccess: "Депозит {amount} {token} выполнен.",
    depositFailed: "Депозит не удался.",
    pickSplit: "Выберите разделение.",
    working: "Обработка…",
    // ManageSplit
    manageTitle: "Управление вашими разделениями",
    chooseSplitControl: "Выберите разделение, которым вы управляете",
    updateButton: "Обновить разделение",
    placeholderController: "G… новый контролёр",
    transferButton: "Передать",
    lockButton: "Зафиксировать навсегда",
    confirmLockButton: "Подтвердить блокировку",
    updateSuccess: "Разделение обновлено.",
    updateFailed: "Обновление отклонено.",
    transferSuccess: "Управление передано.",
    transferFailed: "Передача отклонена.",
    lockConfirmPrompt: "Блокировка необратима. Нажмите ещё раз для подтверждения.",
    lockSuccess: "Разделение зафиксировано навсегда.",
    lockFailed: "Блокировка отклонена.",
    controllerFormatError: "Контролёр должен быть ключом аккаунта G….",
    // SplitList & Detail
    loadingSplits: "Загрузка разделений…",
    noSplitsOnContract: "На этом контракте пока нет разделений.",
    noSplitsPrompt: "Подключите Freighter в тестнете, откройте вкладку Создать и зарегистрируйте первое. XLM в тестнете бесплатный, поэтому попробовать ничего не стоит.",
    recentSplits: "Недавние разделения",
    copy: "Копировать",
    yours: "ваше",
    mutable: "изменяемое",
    locked: "зафиксировано",
    nestedSplit: "разделение #{id}",
    detailEscrow: "эскроу",
    detailController: "контролёр: {controller}",
    detailHistoryTitle: "История платежей и выплат",
    detailHistoryEmpty: "Платежей или выплат пока нет.",
    detailHistoryLoading: "Загрузка истории…",
    // Activity
    recentActivity: "Недавняя активность",
    exportCsv: "Экспорт CSV",
    activityCreated: "создано",
    activityPaid: "оплачено",
    activityUpdated: "обновлено",
    activityDeposit: "депозит",
    activityDistributed: "выплата",
    activityControlMoved: "управление передано",
    activityTx: "транзакция",
    activitySplitNum: "разделение #{id}",
    // Footer
    contractOnTestnet: "Контракт в тестнете",
  },
  it: {
    // Header & Navigation
    connectWallet: "Connetti Freighter",
    github: "GitHub",
    testnet: "Testnet",
    // Intro
    introTitle: "Dividi i pagamenti su Stellar",
    introDesc: "Una transazione in entrata, ogni destinatario pagato per la sua quota. In esecuzione su testnet.",
    // ActionPanel tabs
    tabCreate: "Crea",
    tabPay: "Paga",
    tabEscrow: "Deposito",
    tabManage: "Gestisci",
    // CreateSplit
    createTitle: "Crea una divisione",
    createEditableLabel: "Posso modificare questa divisione in seguito (deseleziona per bloccarla per sempre)",
    createButton: "Crea divisione",
    waitingForSignature: "In attesa di firma…",
    connectWalletFirst: "Connetti prima il tuo portafoglio.",
    splitCreated: "Divisione #{id} creata.",
    contractRejectedSplit: "Il contratto ha rifiutato la divisione.",
    // RecipientEditor
    sharesTotalError: "Le quote devono sommare al 100%.",
    sharesGreaterZeroError: "Le quote devono essere maggiori di zero.",
    recipientRequiredError: "Ogni destinatario ha bisogno di un indirizzo o di un id di divisione.",
    recipientFormatError: "Gli indirizzi dei destinatari devono essere chiavi di account G….",
    kindAddress: "Indirizzo",
    kindSplit: "Divisione",
    placeholderAddress: "Indirizzo destinatario G…",
    placeholderSplit: "Id divisione",
    addRecipient: "Aggiungi destinatario",
    pctOfTotal: "{pct}% del 100%",
    // PaySplit
    payTitle: "Paga tramite una divisione",
    chooseSplit: "Scegli divisione",
    recipientsCount: "{count} destinatari",
    amount: "Importo",
    paySuccess: "Pagati {amount} {token} tramite la divisione #{id}.",
    payFailed: "Pagamento fallito.",
    payButton: "Paga",
    pickSplitAndAmount: "Scegli una divisione e un importo.",
    trustlineWarningTitle: "Impossibile pagare in {token}",
    trustlineWarningItem: "{address} non ha una trustline per {token}. Deve aggiungerla prima che questa divisione possa essere pagata in {token}.",
    trustlineWarningHint: "Il pagamento è bloccato finché tutti i destinatari non potranno ricevere questo token.",
    trustlineNoticeTitle: "Controllo trustline inconcludente",
    trustlineNoticeHint: "Impossibile verificare le trustline per alcuni destinatari. Il pagamento potrebbe fallire se non possono ricevere questo token.",
    // EscrowCard
    escrowTitle: "Deposito",
    escrowDesc: "Parcheggia i fondi in una divisione ora, paga tutti più tardi.",
    pending: "In attesa: {amount} {token}",
    depositButton: "Deposita",
    distributeButton: "Distribuisci",
    distributeSuccess: "Distribuiti {amount} {token} a tutti i destinatari.",
    distributeFailed: "Niente da distribuire.",
    depositSuccess: "Depositati {amount} {token}.",
    depositFailed: "Deposito fallito.",
    pickSplit: "Scegli una divisione.",
    working: "Elaborazione…",
    // ManageSplit
    manageTitle: "Gestisci le tue divisioni",
    chooseSplitControl: "Scegli la divisione che controlli",
    updateButton: "Aggiorna divisione",
    placeholderController: "Nuovo controllore G…",
    transferButton: "Trasferisci",
    lockButton: "Blocca per sempre",
    confirmLockButton: "Conferma blocco",
    updateSuccess: "Divisione aggiornata.",
    updateFailed: "Aggiornamento rifiutato.",
    transferSuccess: "Controllo trasferito.",
    transferFailed: "Trasferimento rifiutato.",
    lockConfirmPrompt: "Il blocco è permanente. Premi di nuovo per confermare.",
    lockSuccess: "Divisione bloccata per sempre.",
    lockFailed: "Blocco rifiutato.",
    controllerFormatError: "Il controllore deve essere una chiave di account G….",
    // SplitList & Detail
    loadingSplits: "Caricamento divisioni…",
    noSplitsOnContract: "Ancora nessuna divisione su questo contratto.",
    noSplitsPrompt: "Connetti Freighter su testnet, apri la scheda Crea e registra la prima. Gli XLM di testnet sono gratuiti tramite friendbot, quindi non costa nulla provare.",
    recentSplits: "Divisioni recenti",
    copy: "Copia",
    yours: "tua",
    mutable: "modificabile",
    locked: "bloccata",
    nestedSplit: "divisione #{id}",
    detailEscrow: "deposito",
    detailController: "controllore: {controller}",
    detailHistoryTitle: "Cronologia Pagamenti & Distribuzioni",
    detailHistoryEmpty: "Nessun pagamento o distribuzione ancora.",
    detailHistoryLoading: "Caricamento cronologia…",
    // Activity
    recentActivity: "Attività recente",
    exportCsv: "Esporta CSV",
    activityCreated: "creata",
    activityPaid: "pagata",
    activityUpdated: "aggiornata",
    activityDeposit: "deposito",
    activityDistributed: "distribuita",
    activityControlMoved: "controllo trasferito",
    activityTx: "tx",
    activitySplitNum: "divisione #{id}",
    // Footer
    contractOnTestnet: "Contratto su testnet",
  },
  tr: {
    // Header & Navigation
    connectWallet: "Freighter'ı Bağla",
    github: "GitHub",
    testnet: "Testnet",
    // Intro
    introTitle: "Stellar'da ödemeleri böl",
    introDesc: "Tek bir işlem, her alıcıya payına göre ödeme yapılır. Testnet üzerinde çalışıyor.",
    // ActionPanel tabs
    tabCreate: "Oluştur",
    tabPay: "Öde",
    tabEscrow: "Emanet",
    tabManage: "Yönet",
    // CreateSplit
    createTitle: "Bölme oluştur",
    createEditableLabel: "Bu bölmeyi daha sonra düzenleyebilirim (sonsuza kadar kilitlemek için işareti kaldırın)",
    createButton: "Bölme oluştur",
    waitingForSignature: "İmza bekleniyor…",
    connectWalletFirst: "Önce cüzdanınızı bağlayın.",
    splitCreated: "Bölme #{id} oluşturuldu.",
    contractRejectedSplit: "Sözleşme bölmeyi reddetti.",
    // RecipientEditor
    sharesTotalError: "Payların toplamı %100 olmalıdır.",
    sharesGreaterZeroError: "Paylar sıfırdan büyük olmalıdır.",
    recipientRequiredError: "Her alıcının bir adresi veya bölme kimliği olmalıdır.",
    recipientFormatError: "Alıcı adresleri G… ile başlayan hesap anahtarları olmalıdır.",
    kindAddress: "Adres",
    kindSplit: "Bölme",
    placeholderAddress: "G… alıcı adresi",
    placeholderSplit: "Bölme kimliği",
    addRecipient: "Alıcı ekle",
    pctOfTotal: "%100'ün %{pct}'si",
    // PaySplit
    payTitle: "Bir bölme aracılığıyla öde",
    chooseSplit: "Bölme seç",
    recipientsCount: "{count} alıcı",
    amount: "Miktar",
    paySuccess: "#{id} numaralı bölme aracılığıyla {amount} {token} ödendi.",
    payFailed: "Ödeme başarısız oldu.",
    payButton: "Öde",
    pickSplitAndAmount: "Bir bölme ve miktar seçin.",
    trustlineWarningTitle: "{token} ile ödeme yapılamıyor",
    trustlineWarningItem: "{address}, {token} için bir güven hattına sahip değil. Bu bölmenin {token} ile ödenebilmesi için bunu eklemeleri gerekir.",
    trustlineWarningHint: "Tüm alıcılar bu token'ı alabilene kadar ödeme engellenir.",
    trustlineNoticeTitle: "Güven hattı kontrolü sonuçsuz",
    trustlineNoticeHint: "Bazı alıcılar için güven hatları doğrulanamadı. Bu token'ı alamazlarsa ödeme başarısız olabilir.",
    // EscrowCard
    escrowTitle: "Emanet",
    escrowDesc: "Fonları şimdi bir bölmeye park edin, herkese daha sonra ödeme yapın.",
    pending: "Bekleyen: {amount} {token}",
    depositButton: "Yatır",
    distributeButton: "Dağıt",
    distributeSuccess: "{amount} {token} tüm alıcılara dağıtıldı.",
    distributeFailed: "Dağıtılacak bir şey yok.",
    depositSuccess: "{amount} {token} yatırıldı.",
    depositFailed: "Yatırma başarısız oldu.",
    pickSplit: "Bir bölme seçin.",
    working: "İşleniyor…",
    // ManageSplit
    manageTitle: "Bölmelerinizi yönetin",
    chooseSplitControl: "Kontrol ettiğiniz bölmeyi seçin",
    updateButton: "Bölmeyi güncelle",
    placeholderController: "G… yeni yönetici",
    transferButton: "Devret",
    lockButton: "Sonsuza kadar kilitle",
    confirmLockButton: "Kilidi onayla",
    updateSuccess: "Bölme güncellendi.",
    updateFailed: "Güncelleme reddedildi.",
    transferSuccess: "Kontrol devredildi.",
    transferFailed: "Devir reddedildi.",
    lockConfirmPrompt: "Kilitleme kalıcıdır. Onaylamak için tekrar basın.",
    lockSuccess: "Bölme sonsuza kadar kilitlendi.",
    lockFailed: "Kilitleme reddedildi.",
    controllerFormatError: "Yönetici G… ile başlayan bir hesap anahtarı olmalıdır.",
    // SplitList & Detail
    loadingSplits: "Bölmeler yükleniyor…",
    noSplitsOnContract: "Bu sözleşmede henüz hiçbir bölme yok.",
    noSplitsPrompt: "Testnet üzerinde Freighter'ı bağlayın, Oluştur sekmesini açın ve ilkini kaydedin. Testnet XLM friendbot'tan ücretsizdir, bu yüzden denemek hiçbir şeye mal olmaz.",
    recentSplits: "Son bölmeler",
    copy: "Kopyala",
    yours: "sizin",
    mutable: "değiştirilebilir",
    locked: "kilitli",
    nestedSplit: "bölme #{id}",
    detailEscrow: "emanet",
    detailController: "yönetici: {controller}",
    detailHistoryTitle: "Ödeme ve Dağıtım Geçmişi",
    detailHistoryEmpty: "Henüz ödeme veya dağıtım yok.",
    detailHistoryLoading: "Geçmiş yükleniyor…",
    // Activity
    recentActivity: "Son etkinlikler",
    exportCsv: "CSV İndir",
    activityCreated: "oluşturuldu",
    activityPaid: "ödendi",
    activityUpdated: "güncellendi",
    activityDeposit: "yatırma",
    activityDistributed: "dağıtıldı",
    activityControlMoved: "kontrol devredildi",
    activityTx: "tx",
    activitySplitNum: "bölme #{id}",
    // Footer
    contractOnTestnet: "Sözleşme testnet üzerinde",
  },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readSavedLanguage());

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    persistLanguage(lang);
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
