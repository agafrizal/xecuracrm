import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  DollarSign,
  Calendar,
  Briefcase,
  Edit2,
  Trash2,
  X,
  TrendingUp,
  Building2,
  FilePlus,
  MessageSquare,
  History,
  PlusCircle,
  Mail,
  Phone,
  Users as UsersIcon,
  StickyNote,
  Lightbulb,
  AlertTriangle,
  ChevronDown,
  Check,
  FileText,
  FileCheck,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Download,
  ExternalLink,
  Lock,
  AlertCircle,
  Package,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Deal,
  DealStage,
  Contact,
  Company,
  POStatus,
  UserProfile,
  Interaction,
  InteractionKind,
  ProposalStatus,
} from "../types";
import { PRODUCT_CATALOG, getBrandsForCategory, getProductTypesForBrand } from "../data/productCatalog";
import { format, parseISO } from "date-fns";
import {
  addDoc,
  collection,
  db,
  updateDoc,
  doc,
  deleteDoc,
  Timestamp,
  OperationType,
  handleFirestoreError,
  logEvent,
  storage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getDocs,
  query,
  where,
} from "../firebase";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import { currencyService } from "../services/currencyService";
import { extractPoNumberFromFile } from "../utils/poExtractor";

interface DealsProps {
  deals: Deal[];
  contacts: Contact[];
  companies: Company[];
  interactions: Interaction[];
  userId: string;
  userRole?: string;
  users: UserProfile[];
  initialFilter?: string | null;
  initialOwnerFilter?: string | null;
  onClearFilter?: () => void;
}

const Deals: React.FC<DealsProps> = ({
  deals,
  contacts,
  companies,
  interactions,
  userId,
  userRole,
  users,
  initialFilter,
  initialOwnerFilter,
  onClearFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [dealToDelete, setDealToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [selectedDealForInteractions, setSelectedDealForInteractions] =
    useState<Deal | null>(null);
  const [selectedDealForSolutions, setSelectedDealForSolutions] =
    useState<Deal | null>(null);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [interactionFormData, setInteractionFormData] = useState({
    kind: "Email" as InteractionKind,
    date: format(new Date(), "yyyy-MM-dd"),
    contactId: "",
    subject: "",
    description: "",
    highlights: "",
    findings: "",
  });
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    initialOwnerFilter || "all",
  );
  const [selectedStages, setSelectedStages] = useState<string[]>(
    initialFilter ? [initialFilter] : [],
  );
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [isStageDropdownOpen, setIsStageDropdownOpen] = useState(false);
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [filterCompanySearch, setFilterCompanySearch] = useState("");
  const [isFilterCompanyDropdownOpen, setIsFilterCompanyDropdownOpen] =
    useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTechProgress, setUploadTechProgress] = useState(0);
  const [isUploadingTech, setIsUploadingTech] = useState(false);
  const [uploadCommProgress, setUploadCommProgress] = useState(0);
  const [isUploadingComm, setIsUploadingComm] = useState(false);
  const [selectedDealForProposal, setSelectedDealForProposal] = useState<Deal | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");

  useEffect(() => {
    if (selectedCompanyId !== "all" && !filterCompanySearch) {
      const company = companies.find((c) => c.id === selectedCompanyId);
      if (company) setFilterCompanySearch(company.name);
    }
  }, [selectedCompanyId, companies, filterCompanySearch]);

  // Keep selectedDealForProposal in sync with latest deals data
  useEffect(() => {
    if (selectedDealForProposal) {
      const updated = deals.find((d) => d.id === selectedDealForProposal.id);
      if (updated) {
        setSelectedDealForProposal(updated);
      }
    }
  }, [deals]);

  const [formData, setFormData] = useState<{
    title: string;
    value: number;
    stage: DealStage;
    companyId: string;
    contactId: string;
    expectedCloseDate: string;
    potentialGrossProfit: number;
    opportunityType: "Renewal" | "New";
    productCategory?: string;
    productBrand?: string;
    productType?: string;
    productSolutions: DealProductSolution[];
    poDocumentUrl: string;
    poDocumentName: string;
    poNumber: string;
    proposalType?: "commercial_only" | "commercial_and_technical";
    technicalProposalUrl?: string;
    technicalProposalName?: string;
    commercialProposalUrl?: string;
    commercialProposalName?: string;
    proposalStatus?: ProposalStatus;
    proposalSubmittedAt?: Timestamp | null;
    proposalApprovedAt?: Timestamp | null;
    proposalApprovedBy?: string;
    proposalApproverName?: string;
    proposalRejectionReason?: string;
    proposalSentToCustomer?: boolean;
    proposalSentAt?: Timestamp | null;
  }>({
    title: "",
    value: 0,
    stage: "L1-prospecting" as DealStage,
    companyId: "",
    contactId: "",
    expectedCloseDate: "",
    potentialGrossProfit: 0,
    opportunityType: "New" as "Renewal" | "New",
    productCategory: "",
    productBrand: "",
    productType: "",
    productSolutions: [],
    poDocumentUrl: "",
    poDocumentName: "",
    poNumber: "",
    proposalType: "commercial_only" as "commercial_only" | "commercial_and_technical",
    technicalProposalUrl: "",
    technicalProposalName: "",
    commercialProposalUrl: "",
    commercialProposalName: "",
    proposalStatus: "draft",
    proposalSubmittedAt: null,
    proposalApprovedAt: null,
    proposalApprovedBy: "",
    proposalApproverName: "",
    proposalRejectionReason: "",
    proposalSentToCustomer: false,
    proposalSentAt: null,
  });

  useEffect(() => {
    if (initialFilter || initialOwnerFilter) {
      if (initialFilter) setSelectedStages([initialFilter]);
      if (initialOwnerFilter) setSelectedOwnerId(initialOwnerFilter);
      onClearFilter?.();
    }
  }, [initialFilter, initialOwnerFilter, onClearFilter]);

  useEffect(() => {
    const fetchRate = async () => {
      const rates = await currencyService.getRates();
      if (rates && rates.rates.USD) {
        setUsdRate(rates.rates.USD);
      }
    };
    fetchRate();
  }, []);

  const formatCurrency = (amount: number) => {
    const idr = currencyService.formatIDR(amount);
    if (usdRate) {
      const usd = currencyService.formatUSD(amount * usdRate);
      return (
        <div className="flex flex-col">
          <span className="font-bold text-brand-text">{idr}</span>
          <span className="text-[10px] text-brand-muted font-normal">
            ≈ {usd}
          </span>
        </div>
      );
    }
    return <span className="font-bold text-brand-text">{idr}</span>;
  };

  const getCompanyName = (id?: string) => {
    if (!id) return "N/A";
    return companies.find((c) => c.id === id)?.name || "Unknown Company";
  };

  const filteredDeals = deals
    .filter((deal) => {
      const matchesSearch =
        deal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getCompanyName(deal.companyId)
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        Boolean(deal.productCategory && deal.productCategory.toLowerCase().includes(searchTerm.toLowerCase())) ||
        Boolean(deal.productBrand && deal.productBrand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        Boolean(deal.productType && deal.productType.toLowerCase().includes(searchTerm.toLowerCase())) ||
        Boolean(deal.productSolutions && deal.productSolutions.some(s => 
          s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.productType && s.productType.toLowerCase().includes(searchTerm.toLowerCase()))
        ));

      const matchesOwner =
        selectedOwnerId === "all" || deal.ownerId === selectedOwnerId;
      const matchesStage =
        selectedStages.length === 0 ||
        selectedStages.some((s) =>
          s === "active"
            ? deal.stage !== "L5-closed-won" && deal.stage !== "L0-closed-lost"
            : deal.stage === s,
        );
      const matchesQuarter =
        selectedQuarters.length === 0 ||
        selectedQuarters.includes(deal.expectedCloseQuarter || "");
      const matchesCompany =
        selectedCompanyId === "all" || deal.companyId === selectedCompanyId;
      const matchesCategory =
        selectedCategoryFilter === "all" ||
        deal.productCategory === selectedCategoryFilter ||
        Boolean(deal.productSolutions && deal.productSolutions.some((s) => s.category === selectedCategoryFilter));

      return (
        matchesSearch &&
        matchesOwner &&
        matchesStage &&
        matchesQuarter &&
        matchesCompany &&
        matchesCategory
      );
    })
    .sort((a, b) => {
      const companyA = getCompanyName(a.companyId).toLowerCase();
      const companyB = getCompanyName(b.companyId).toLowerCase();
      if (companyA < companyB) return -1;
      if (companyA > companyB) return 1;

      // If companies are the same, sort by stage descending (L5 is highest)
      if (a.stage > b.stage) return -1;
      if (a.stage < b.stage) return 1;
      return 0;
    });

  const totalFilteredValue = filteredDeals.reduce(
    (sum, deal) => sum + (deal.value || 0),
    0,
  );
  const totalFilteredGP = filteredDeals.reduce(
    (sum, deal) => sum + (deal.value * (deal.potentialGrossProfit || 0)) / 100,
    0,
  );

  const groupedDeals = filteredDeals.reduce(
    (acc, deal) => {
      const owner = users.find((u) => u.uid === deal.ownerId);
      const ownerName = owner ? owner.displayName : "Unassigned";
      if (!acc[ownerName]) {
        acc[ownerName] = [];
      }
      acc[ownerName].push(deal);
      return acc;
    },
    {} as Record<string, Deal[]>,
  );

  const availableQuarters = useMemo(() => {
    const q = new Set<string>();
    deals.forEach((deal) => {
      if (deal.expectedCloseQuarter) {
        q.add(deal.expectedCloseQuarter);
      }
    });
    return Array.from(q).sort().reverse(); // Show latest quarters first
  }, [deals]);

  const getDaysInStage = (stageUpdatedAt: Timestamp) => {
    const now = new Date();
    const updated = stageUpdatedAt.toDate();
    const diffTime = Math.abs(now.getTime() - updated.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getQuarter = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const month = date.getMonth();
    const year = date.getFullYear();
    const quarter = Math.floor(month / 3) + 1;
    return `Q${quarter} ${year}`;
  };

  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  const filteredCompaniesForFilter = companies.filter((company) =>
    company.name.toLowerCase().includes(filterCompanySearch.toLowerCase()),
  );

  const handleSelectCompany = (company: Company) => {
    setFormData({ ...formData, companyId: company.id, contactId: "" });
    setCompanySearch(company.name);
    setIsCompanyDropdownOpen(false);
  };

  const handleSelectFilterCompany = (company: Company | "all") => {
    if (company === "all") {
      setSelectedCompanyId("all");
      setFilterCompanySearch("");
    } else {
      setSelectedCompanyId(company.id);
      setFilterCompanySearch(company.name);
    }
    setIsFilterCompanyDropdownOpen(false);
  };

  const toggleStage = (stage: string) => {
    setSelectedStages((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage],
    );
  };

  const toggleQuarter = (quarter: string) => {
    setSelectedQuarters((prev) =>
      prev.includes(quarter)
        ? prev.filter((q) => q !== quarter)
        : [...prev, quarter],
    );
  };

  const STAGES: { value: string; label: string }[] = [
    { value: "L1-prospecting", label: "L1 - Prospecting" },
    { value: "L2-proposal", label: "L2 - Proposal" },
    { value: "L3-show-interest", label: "L3 - Show Interest" },
    { value: "L4-negotiation", label: "L4 - Negotiation" },
    { value: "L5-closed-won", label: "L5 - Closed Won" },
    { value: "L0-closed-lost", label: "L0 - Closed Lost" },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload PDF files only.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    extractPoNumberFromFile(file)
      .then((extractedPoNumber) => {
        if (extractedPoNumber) {
          setFormData((prev) => ({
            ...prev,
            poNumber: extractedPoNumber,
          }));
        }
      })
      .catch((err) => console.warn("Extraction error in deal upload:", err));

    try {
      const storageRef = ref(
        storage,
        `poDocs/${userId}/${Date.now()}_${file.name}`,
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          let message = "Error uploading file. Please try again.";
          if (error.code === "storage/unauthorized") {
            message =
              "Permission denied: Firebase Storage rules might be blocking the upload. Please ensure storage is enabled in your Firebase project.";
          }
          alert(message);
          setIsUploading(false);
          setUploadProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData((prev) => ({
            ...prev,
            poDocumentUrl: downloadURL,
            poDocumentName: file.name,
          }));
          setIsUploading(false);
          setUploadProgress(0);
        },
      );
    } catch (error: any) {
      console.error("Error initiating upload:", error);
      alert(`Error initiating upload: ${error.message}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleTechProposalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload PDF files only for Technical Proposal.");
      return;
    }

    setIsUploadingTech(true);
    setUploadTechProgress(0);

    try {
      const storageRef = ref(
        storage,
        `proposals/${userId}/technical/${Date.now()}_${file.name.replace(/\s+/g, "_")}`,
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadTechProgress(progress);
        },
        (error) => {
          console.error("Technical proposal upload error:", error);
          let message = "Error uploading technical proposal. Please try again.";
          if (error.code === "storage/unauthorized") {
            message = "Permission denied: Firebase Storage rules might be blocking the upload. Ensure storage is enabled.";
          }
          alert(message);
          setIsUploadingTech(false);
          setUploadTechProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData((prev) => ({
            ...prev,
            technicalProposalUrl: downloadURL,
            technicalProposalName: file.name,
            proposalStatus: "draft",
            proposalSentToCustomer: false,
          }));
          setIsUploadingTech(false);
          setUploadTechProgress(0);
        },
      );
    } catch (error: any) {
      console.error("Error starting technical proposal upload:", error);
      alert(`Error initiating upload: ${error.message}`);
      setIsUploadingTech(false);
      setUploadTechProgress(0);
    }
  };

  const handleCommProposalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload PDF files only for Commercial Proposal.");
      return;
    }

    setIsUploadingComm(true);
    setUploadCommProgress(0);

    try {
      const storageRef = ref(
        storage,
        `proposals/${userId}/commercial/${Date.now()}_${file.name.replace(/\s+/g, "_")}`,
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadCommProgress(progress);
        },
        (error) => {
          console.error("Commercial proposal upload error:", error);
          let message = "Error uploading commercial proposal. Please try again.";
          if (error.code === "storage/unauthorized") {
            message = "Permission denied: Firebase Storage rules might be blocking the upload. Ensure storage is enabled.";
          }
          alert(message);
          setIsUploadingComm(false);
          setUploadCommProgress(0);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData((prev) => ({
            ...prev,
            commercialProposalUrl: downloadURL,
            commercialProposalName: file.name,
            proposalStatus: "draft",
            proposalSentToCustomer: false,
          }));
          setIsUploadingComm(false);
          setUploadCommProgress(0);
        },
      );
    } catch (error: any) {
      console.error("Error starting commercial proposal upload:", error);
      alert(`Error initiating upload: ${error.message}`);
      setIsUploadingComm(false);
      setUploadCommProgress(0);
    }
  };

  const handleSubmitProposalForApproval = async (deal: Deal) => {
    const isCommercialAndTechnical =
      deal.proposalType === "commercial_and_technical" ||
      (!deal.proposalType && deal.technicalProposalUrl);

    if (!deal.commercialProposalUrl) {
      alert("Commercial Proposal must be uploaded before submitting for approval.");
      return;
    }

    if (isCommercialAndTechnical && !deal.technicalProposalUrl) {
      alert("Both Technical Proposal and Commercial Proposal must be uploaded before submitting for approval.");
      return;
    }
    try {
      const dealRef = doc(db, "deals", deal.id);
      await updateDoc(dealRef, {
        proposalStatus: "pending_approval",
        proposalSubmittedAt: Timestamp.now(),
        proposalRejectionReason: null,
        updatedAt: Timestamp.now(),
      });

      const adminUsers = users.filter((u) => u.role === "admin");
      const currentUserName = users.find((u) => u.uid === userId)?.displayName || "Sales";
      for (const admin of adminUsers) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: admin.uid,
            title: "Proposal Awaiting Approval",
            message: `Proposal for deal "${deal.title}" was submitted for your approval by ${currentUserName}.`,
            type: "warning",
            read: false,
            relatedId: deal.id,
            relatedType: "deal",
            createdAt: Timestamp.now(),
          });
        } catch (nErr) {
          console.warn("Could not notify admin:", nErr);
        }
      }

      await logEvent("Proposal Submitted for Approval", `Deal: ${deal.title}`);
      alert("Proposals submitted for Admin approval successfully!");
      if (selectedDealForProposal?.id === deal.id) {
        setSelectedDealForProposal((prev) =>
          prev
            ? {
                ...prev,
                proposalStatus: "pending_approval",
                proposalSubmittedAt: Timestamp.now(),
                proposalRejectionReason: undefined,
              }
            : null,
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
    }
  };

  const handleApproveProposal = async (deal: Deal) => {
    if (userRole !== "admin") {
      alert("Approval is restricted to Admins only.");
      return;
    }
    try {
      const approverName =
        users.find((u) => u.uid === userId)?.displayName || "Admin";
      const dealRef = doc(db, "deals", deal.id);
      await updateDoc(dealRef, {
        proposalStatus: "approved",
        proposalApprovedAt: Timestamp.now(),
        proposalApprovedBy: userId,
        proposalApproverName: approverName,
        proposalRejectionReason: null,
        updatedAt: Timestamp.now(),
      });

      try {
        await addDoc(collection(db, "notifications"), {
          userId: deal.ownerId,
          title: "Proposal Approved",
          message: `Your proposals for "${deal.title}" have been approved by ${approverName}. You may now send them to the customer.`,
          type: "success",
          read: false,
          relatedId: deal.id,
          relatedType: "deal",
          createdAt: Timestamp.now(),
        });
      } catch (nErr) {
        console.warn("Could not notify deal owner:", nErr);
      }

      await logEvent("Proposal Approved", `Deal: ${deal.title} by ${approverName}`);
      alert("Proposal approved successfully! Sales may now send it to the customer.");
      if (selectedDealForProposal?.id === deal.id) {
        setSelectedDealForProposal((prev) =>
          prev
            ? {
                ...prev,
                proposalStatus: "approved",
                proposalApprovedAt: Timestamp.now(),
                proposalApprovedBy: userId,
                proposalApproverName: approverName,
                proposalRejectionReason: undefined,
              }
            : null,
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
    }
  };

  const handleRejectProposal = async (deal: Deal, reason: string) => {
    if (userRole !== "admin") {
      alert("Only Admins can reject proposals.");
      return;
    }
    if (!reason.trim()) {
      alert("Please provide a reason for rejecting the proposal.");
      return;
    }
    try {
      const dealRef = doc(db, "deals", deal.id);
      await updateDoc(dealRef, {
        proposalStatus: "rejected",
        proposalRejectionReason: reason.trim(),
        updatedAt: Timestamp.now(),
      });

      try {
        await addDoc(collection(db, "notifications"), {
          userId: deal.ownerId,
          title: "Proposal Needs Revision",
          message: `Proposals for deal "${deal.title}" were rejected by Admin: ${reason.trim()}`,
          type: "error",
          read: false,
          relatedId: deal.id,
          relatedType: "deal",
          createdAt: Timestamp.now(),
        });
      } catch (nErr) {
        console.warn("Could not notify deal owner:", nErr);
      }

      await logEvent("Proposal Rejected", `Deal: ${deal.title}. Reason: ${reason}`);
      setIsRejectModalOpen(false);
      setRejectionReasonInput("");
      alert("Proposal marked as rejected. Sales has been notified to revise.");
      if (selectedDealForProposal?.id === deal.id) {
        setSelectedDealForProposal((prev) =>
          prev
            ? {
                ...prev,
                proposalStatus: "rejected",
                proposalRejectionReason: reason.trim(),
              }
            : null,
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
    }
  };

  const handleSendToCustomer = async (deal: Deal) => {
    if (deal.proposalStatus !== "approved") {
      alert("Cannot send to customer: The proposal must be approved by an Admin first.");
      return;
    }
    try {
      const dealRef = doc(db, "deals", deal.id);
      await updateDoc(dealRef, {
        proposalSentToCustomer: true,
        proposalSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      await logEvent("Proposal Sent to Customer", `Deal: ${deal.title}`);
      alert("Proposal marked as sent to customer!");
      if (selectedDealForProposal?.id === deal.id) {
        setSelectedDealForProposal((prev) =>
          prev
            ? {
                ...prev,
                proposalSentToCustomer: true,
                proposalSentAt: Timestamp.now(),
              }
            : null,
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      value: 0,
      stage: "L1-prospecting",
      companyId: "",
      contactId: "",
      expectedCloseDate: "",
      potentialGrossProfit: 0,
      opportunityType: "New",
      productCategory: "",
      productBrand: "",
      productType: "",
      productSolutions: [],
      poDocumentUrl: "",
      poDocumentName: "",
      poNumber: "",
      proposalType: "commercial_only",
      technicalProposalUrl: "",
      technicalProposalName: "",
      commercialProposalUrl: "",
      commercialProposalName: "",
      proposalStatus: "draft",
      proposalSubmittedAt: null,
      proposalApprovedAt: null,
      proposalApprovedBy: "",
      proposalApproverName: "",
      proposalRejectionReason: "",
      proposalSentToCustomer: false,
      proposalSentAt: null,
    });
    setCompanySearch("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      formData.stage === "L2-proposal" ||
      (["L3-show-interest", "L4-negotiation"].includes(formData.stage) &&
        (editingDeal?.stage === "L1-prospecting" || editingDeal?.stage === "L0-closed-lost" || !editingDeal))
    ) {
      if (!formData.commercialProposalUrl) {
        alert("A Commercial Proposal is required before the deal can advance.");
        return;
      }
      if (formData.proposalType === "commercial_and_technical" && !formData.technicalProposalUrl) {
        alert("Because 'Commercial & Technical' proposal option is selected, Sales is required to upload both the Commercial Proposal and Technical Proposal.");
        return;
      }
    }

    if (formData.stage === "L5-closed-won") {
      if (!formData.poDocumentUrl) {
        alert("A PO Document is required for deals in L5 - Closed Won stage.");
        return;
      }
      if (
        (formData.technicalProposalUrl || formData.commercialProposalUrl) &&
        formData.proposalStatus !== "approved"
      ) {
        alert("Cannot mark deal as Closed Won: Proposals must be approved by an Admin before advancing to Closed Won.");
        return;
      }
    }

    try {
      const dealOwnerId = userId; // Always own the deals you create
      const expectedCloseQuarter = getQuarter(formData.expectedCloseDate);
      let dealIdForPo = editingDeal?.id;

      const { poNumber, ...dealPayloadRaw } = formData;
      const dealPayload: any = {
        ...dealPayloadRaw,
        proposalStatus:
          formData.stage === "L2-proposal" ||
          formData.technicalProposalUrl ||
          formData.commercialProposalUrl
            ? formData.proposalStatus || "draft"
            : formData.proposalStatus || null,
      };

      if (editingDeal) {
        const dealRef = doc(db, "deals", editingDeal.id);
        const stageChanged = editingDeal.stage !== formData.stage;

        // If user is not admin, prevent setting proposalStatus to 'approved' if it wasn't approved before
        if (
          userRole !== "admin" &&
          dealPayload.proposalStatus === "approved" &&
          editingDeal.proposalStatus !== "approved"
        ) {
          dealPayload.proposalStatus = "draft";
        }

        await updateDoc(dealRef, {
          ...dealPayload,
          expectedCloseQuarter,
          stageUpdatedAt: stageChanged
            ? Timestamp.now()
            : editingDeal.stageUpdatedAt,
          ownerId: editingDeal.ownerId, // Keep original owner on update
          updatedAt: Timestamp.now(),
        });
        await logEvent("Deal Updated", `Deal: ${formData.title}`);
      } else {
        // If creating deal in L2, ensure status is draft if user is not admin
        if (userRole !== "admin" && dealPayload.proposalStatus === "approved") {
          dealPayload.proposalStatus = "draft";
        }

        const docRef = await addDoc(collection(db, "deals"), {
          ...dealPayload,
          expectedCloseQuarter,
          stageUpdatedAt: Timestamp.now(),
          ownerId: dealOwnerId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        dealIdForPo = docRef.id;
        await logEvent("Deal Created", `Deal: ${formData.title}`);
      }

      // Automatically create a PO if stage is L5-closed-won and document uploaded
      if (
        formData.stage === "L5-closed-won" &&
        formData.poDocumentUrl &&
        dealIdForPo
      ) {
        const poQuery = query(
          collection(db, "purchaseOrders"),
          where("dealId", "==", dealIdForPo),
        );
        const poSnapshot = await getDocs(poQuery);
        if (poSnapshot.empty) {
          const poData: any = {
            poNumber: formData.poNumber || `PO-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
            title: formData.title,
            companyId: formData.companyId,
            contactId: formData.contactId || null,
            dealId: dealIdForPo,
            amount: formData.value,
            status: "approved" as any,
            issueDate: Timestamp.now(),
            ownerId: dealOwnerId,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            poUrl: formData.poDocumentUrl,
            poName: formData.poDocumentName,
          };
          const poDocRef = await addDoc(collection(db, "purchaseOrders"), poData);

          try {
            const planData: any = {
              dealId: dealIdForPo,
              poId: poDocRef.id,
              companyId: formData.companyId || null,
              contactId: formData.contactId || null,
              title: formData.title,
              value: formData.value,
              status: "Draft",
              implementor: "Internal",
              proposedDurationWeeks: 4,
              actualDurationWeeks: null,
              startDate: Timestamp.now(),
              targetEndDate: Timestamp.fromDate(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
              assignedPmId: dealOwnerId,
              ownerId: dealOwnerId,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };
            await addDoc(collection(db, "implementationPlans"), planData);
          } catch (pErr) {
            console.error("Error creating implementation plan for auto PO:", pErr);
          }

          await addDoc(collection(db, "notifications"), {
            userId: userId,
            title: "Incoming PO Created",
            message: `An incoming PO has been created automatically from won deal "${formData.title}".`,
            type: "success",
            read: false,
            relatedId: dealIdForPo,
            relatedType: "purchaseOrder",
            createdAt: Timestamp.now(),
          });
          await logEvent(
            "PO Created from Deal Auto",
            `PO for Deal: ${formData.title}`,
          );
        }
      }

      setIsModalOpen(false);
      setEditingDeal(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(
        error,
        editingDeal ? OperationType.UPDATE : OperationType.CREATE,
        "deals",
      );
    }
  };

  const handleDelete = async (id: string) => {
    setDealToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!dealToDelete) return;
    const deal = deals.find((d) => d.id === dealToDelete);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "deals", dealToDelete));
      if (deal) {
        await logEvent("Deal Deleted", `Deal: ${deal.title}`);
      }
      setIsDeleteModalOpen(false);
      setDealToDelete(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `deals/${dealToDelete}`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (deal: Deal) => {
    setEditingDeal(deal);
    setFormData({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      companyId: deal.companyId || "",
      contactId: deal.contactId || "",
      expectedCloseDate: deal.expectedCloseDate || "",
      potentialGrossProfit: deal.potentialGrossProfit || 0,
      opportunityType: deal.opportunityType || "New",
      productCategory: deal.productCategory || "",
      productBrand: deal.productBrand || "",
      productType: deal.productType || "",
      productSolutions: deal.productSolutions || [],
      poDocumentUrl: deal.poDocumentUrl || "",
      poDocumentName: deal.poDocumentName || "",
      poNumber: "",
      proposalType: deal.proposalType || (deal.technicalProposalUrl ? "commercial_and_technical" : "commercial_only"),
      technicalProposalUrl: deal.technicalProposalUrl || "",
      technicalProposalName: deal.technicalProposalName || "",
      commercialProposalUrl: deal.commercialProposalUrl || "",
      commercialProposalName: deal.commercialProposalName || "",
      proposalStatus: deal.proposalStatus || (deal.stage === "L2-proposal" ? "draft" : undefined),
      proposalSubmittedAt: deal.proposalSubmittedAt || null,
      proposalApprovedAt: deal.proposalApprovedAt || null,
      proposalApprovedBy: deal.proposalApprovedBy || "",
      proposalApproverName: deal.proposalApproverName || "",
      proposalRejectionReason: deal.proposalRejectionReason || "",
      proposalSentToCustomer: !!deal.proposalSentToCustomer,
      proposalSentAt: deal.proposalSentAt || null,
    });
    setCompanySearch(getCompanyName(deal.companyId));
    setIsModalOpen(true);
  };

  const handleCreatePO = async (deal: Deal) => {
    if (deal.stage !== "L5-closed-won") {
      alert(
        'Only deals in "L5 - Closed Won" stage can be converted to an Incoming Purchase Order.',
      );
      return;
    }
    try {
      const poData: any = {
        poNumber: `PO-${format(new Date(), "yyyyMMdd")}-${Math.floor(Math.random() * 1000)}`,
        title: deal.title,
        companyId: deal.companyId,
        contactId: deal.contactId || null,
        dealId: deal.id,
        amount: deal.value,
        status: "approved" as POStatus,
        issueDate: Timestamp.now(),
        ownerId: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const poDocRef = await addDoc(collection(db, "purchaseOrders"), poData);

      try {
        const planData: any = {
          dealId: deal.id,
          poId: poDocRef.id,
          companyId: deal.companyId || null,
          contactId: deal.contactId || null,
          title: deal.title,
          value: deal.value,
          status: "Draft",
          implementor: "Internal",
          proposedDurationWeeks: 4,
          actualDurationWeeks: null,
          startDate: Timestamp.now(),
          targetEndDate: Timestamp.fromDate(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
          assignedPmId: userId,
          ownerId: userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await addDoc(collection(db, "implementationPlans"), planData);
      } catch (pErr) {
        console.error("Error creating implementation plan for manual PO:", pErr);
      }

      // Create notification
      await addDoc(collection(db, "notifications"), {
        userId: userId,
        title: "Incoming PO Created",
        message: `An incoming PO has been created from deal "${deal.title}".`,
        type: "success",
        read: false,
        relatedId: deal.id,
        relatedType: "purchaseOrder",
        createdAt: Timestamp.now(),
      });

      await logEvent("PO Created from Deal", `PO for Deal: ${deal.title}`);
      alert(
        "Incoming PO created successfully! You can find it in the Incoming PO section.",
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "purchaseOrders");
    }
  };

  const handleLogInteraction = (deal: Deal) => {
    setSelectedDealForInteractions(deal);
    setInteractionError(null);
    setInteractionFormData({
      kind: "Email",
      date: format(new Date(), "yyyy-MM-dd"),
      contactId: deal.contactId || "",
      subject: `Follow up: ${deal.title}`.substring(0, 200),
      description: "",
      highlights: "",
      findings: "",
    });
    setIsInteractionModalOpen(true);
  };

  const handleInteractionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDealForInteractions) return;
    setInteractionError(null);

    try {
      const interactionData: any = {
        kind: interactionFormData.kind,
        date: Timestamp.fromDate(parseISO(interactionFormData.date)),
        companyId: selectedDealForInteractions.companyId || "",
        contactId:
          interactionFormData.contactId ||
          selectedDealForInteractions.contactId ||
          "",
        dealId: selectedDealForInteractions.id,
        subject: interactionFormData.subject,
        description: interactionFormData.description,
        highlights: interactionFormData.highlights,
        findings: interactionFormData.findings,
        ownerId: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, "interactions"), interactionData);
      await logEvent(
        "Interaction Created from Deal",
        `Interaction: ${interactionFormData.subject}`,
      );
      setIsInteractionModalOpen(false);
      setSelectedDealForInteractions(null);
    } catch (error: any) {
      console.error("Error logging interaction:", error);
      try {
        handleFirestoreError(error, OperationType.CREATE, "interactions");
      } catch (e: any) {
        // Try to parse the JSON error message from handleFirestoreError
        try {
          const parsed = JSON.parse(e.message);
          setInteractionError(
            parsed.error ||
              "Failed to log interaction. Please check your permissions.",
          );
        } catch {
          setInteractionError(e.message || "An unexpected error occurred.");
        }
      }
    }
  };

  const getKindIcon = (kind: InteractionKind) => {
    switch (kind) {
      case "Email":
        return <Mail size={14} />;
      case "Call":
        return <Phone size={14} />;
      case "Meeting":
        return <UsersIcon size={14} />;
      case "Notes":
        return <StickyNote size={14} />;
      default:
        return <MessageSquare size={14} />;
    }
  };

  const stageColors: Record<DealStage, string> = {
    "L0-closed-lost":
      "bg-brand-red/10 text-brand-red border border-brand-red/20",
    "L1-prospecting":
      "bg-brand-blue/10 text-brand-blue border border-brand-blue/20",
    "L2-proposal": "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    "L3-show-interest":
      "bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20",
    "L4-negotiation":
      "bg-purple-500/10 text-purple-500 border border-purple-500/20",
    "L5-closed-won":
      "bg-brand-gold/10 text-brand-gold border border-brand-gold/20",
  };

  const stageLabels: Record<DealStage, string> = {
    "L0-closed-lost": "L0",
    "L1-prospecting": "L1",
    "L2-proposal": "L2",
    "L3-show-interest": "L3",
    "L4-negotiation": "L4",
    "L5-closed-won": "L5",
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"
              size={20}
            />
            <input
              type="text"
              placeholder="Search deals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text placeholder:text-brand-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all font-medium"
            />
          </div>
          <div className="w-full sm:w-40">
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium"
            >
              <option value="all">All Users</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} ({u.role ? u.role.replace('_', ' ').toUpperCase() : 'USER'})
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40 relative">
            <button
              onClick={() => {
                setIsStageDropdownOpen(!isStageDropdownOpen);
                setIsQuarterDropdownOpen(false);
                setIsFilterCompanyDropdownOpen(false);
              }}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium flex items-center justify-between"
            >
              <span className="truncate">
                {selectedStages.length === 0
                  ? "All Stages"
                  : `${selectedStages.length} Stages`}
              </span>
              <ChevronDown
                size={16}
                className={`text-brand-muted transition-transform ${isStageDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {isStageDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsStageDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-50 w-full sm:w-64 mt-1 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl overflow-hidden p-2"
                  >
                    <button
                      onClick={() => setSelectedStages([])}
                      className="w-full px-3 py-2 text-left text-xs font-bold text-brand-gold hover:bg-brand-gold/5 rounded-lg mb-1 transition-colors uppercase tracking-widest"
                    >
                      Clear All
                    </button>
                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                      {STAGES.map((stage) => (
                        <button
                          key={stage.value}
                          onClick={() => toggleStage(stage.value)}
                          className="w-full px-3 py-2 flex items-center justify-between rounded-lg hover:bg-white/5 transition-colors group"
                        >
                          <span
                            className={`text-sm ${selectedStages.includes(stage.value) ? "text-brand-gold font-bold" : "text-brand-text"}`}
                          >
                            {stage.label}
                          </span>
                          {selectedStages.includes(stage.value) && (
                            <Check size={14} className="text-brand-gold" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="w-full sm:w-40 relative">
            <button
              onClick={() => {
                setIsQuarterDropdownOpen(!isQuarterDropdownOpen);
                setIsStageDropdownOpen(false);
                setIsFilterCompanyDropdownOpen(false);
              }}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium flex items-center justify-between"
            >
              <span className="truncate">
                {selectedQuarters.length === 0
                  ? "All Quarters"
                  : `${selectedQuarters.length} Quarters`}
              </span>
              <ChevronDown
                size={16}
                className={`text-brand-muted transition-transform ${isQuarterDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {isQuarterDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsQuarterDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-50 w-full sm:w-64 mt-1 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl overflow-hidden p-2"
                  >
                    <button
                      onClick={() => setSelectedQuarters([])}
                      className="w-full px-3 py-2 text-left text-xs font-bold text-brand-gold hover:bg-brand-gold/5 rounded-lg mb-1 transition-colors uppercase tracking-widest"
                    >
                      Clear All
                    </button>
                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                      {availableQuarters.map((q) => (
                        <button
                          key={q}
                          onClick={() => toggleQuarter(q)}
                          className="w-full px-3 py-2 flex items-center justify-between rounded-lg hover:bg-white/5 transition-colors group"
                        >
                          <span
                            className={`text-sm ${selectedQuarters.includes(q) ? "text-brand-gold font-bold" : "text-brand-text"}`}
                          >
                            {q}
                          </span>
                          {selectedQuarters.includes(q) && (
                            <Check size={14} className="text-brand-gold" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="w-full sm:w-40 relative">
            <div className="relative">
              <input
                type="text"
                value={
                  selectedCompanyId === "all" && !isFilterCompanyDropdownOpen
                    ? ""
                    : filterCompanySearch
                }
                onChange={(e) => {
                  setFilterCompanySearch(e.target.value);
                  setIsFilterCompanyDropdownOpen(true);
                  if (e.target.value === "") {
                    setSelectedCompanyId("all");
                  }
                }}
                onFocus={() => setIsFilterCompanyDropdownOpen(true)}
                onBlur={() =>
                  setTimeout(() => setIsFilterCompanyDropdownOpen(false), 200)
                }
                placeholder="All Companies"
                className="w-full pl-9 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text placeholder:text-brand-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium"
              />
              <Building2
                className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted/40"
                size={16}
              />
              {selectedCompanyId !== "all" && (
                <button
                  onClick={() => handleSelectFilterCompany("all")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-red transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {isFilterCompanyDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 w-full sm:w-64 mt-1 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto left-0 sm:left-auto sm:right-0"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectFilterCompany("all")}
                    className="w-full px-4 py-2 text-left text-brand-text hover:bg-white/5 transition-colors flex items-center justify-between group border-b border-white/5"
                  >
                    <span className="font-bold text-brand-muted">
                      All Companies
                    </span>
                    {selectedCompanyId === "all" && (
                      <div className="w-2 h-2 rounded-full bg-brand-gold" />
                    )}
                  </button>
                  {filteredCompaniesForFilter.length > 0 ? (
                    filteredCompaniesForFilter
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => handleSelectFilterCompany(company)}
                          className="w-full px-4 py-2 text-left text-brand-text hover:bg-white/5 transition-colors flex items-center justify-between group"
                        >
                          <span className="truncate">{company.name}</span>
                          {selectedCompanyId === company.id && (
                            <div className="w-2 h-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(197,160,89,0.5)]" />
                          )}
                        </button>
                      ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-brand-muted italic">
                      No companies found
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Category Filter Dropdown */}
          <div className="w-full sm:w-44">
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium cursor-pointer"
            >
              <option value="all">📦 All Categories</option>
              {PRODUCT_CATALOG.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {(userRole === "admin" ||
            userRole === "sales" ||
            userRole === "super_user" ||
            userRole === "engineer" ||
            userRole === "project_manager") && (
            <button
              onClick={() => {
                setEditingDeal(null);
                resetForm();
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-brand-gold/20"
            >
              <Plus size={20} />
              Add Deal
            </button>
          )}
        </div>
      </div>

      <div className="bg-brand-card rounded-3xl border border-white/5 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">
                  Company
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">
                  Deal Title
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap text-brand-gold">
                  Value
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  GP (%)
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Stage
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Proposal (L2)
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Expected Close
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Object.entries(groupedDeals).map(
                ([ownerName, ownerDeals]: [string, any]) => (
                  <React.Fragment key={ownerName}>
                    <tr className="bg-white/5 border-b border-white/5">
                      <td
                        colSpan={8}
                        className="px-6 py-3 text-[10px] font-bold text-brand-gold uppercase tracking-widest"
                      >
                        {ownerName} ({ownerDeals.length}{" "}
                        {ownerDeals.length === 1 ? "deal" : "deals"})
                      </td>
                    </tr>
                    {ownerDeals.map((deal) => (
                      <React.Fragment key={deal.id}>
                        <tr
                          className={`group transition-colors ${
                            deal.stage === "L0-closed-lost"
                              ? "bg-brand-red/5 hover:bg-brand-red/10"
                              : deal.stage === "L5-closed-won"
                                ? "bg-brand-gold/5 hover:bg-brand-gold/10"
                                : "hover:bg-white/5"
                          }`}
                        >
                          <td className="px-4 py-3 !text-left min-w-[140px]">
                            <div className="flex items-center justify-start gap-3 !text-left">
                              <div className="shrink-0 p-2 bg-white/5 rounded-lg">
                                <Building2
                                  size={16}
                                  className="text-brand-gold/60"
                                />
                              </div>
                              <span className="text-brand-text font-medium !text-left leading-snug">
                                {getCompanyName(deal.companyId)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 !text-left min-w-[200px]">
                            <div className="flex items-center justify-start gap-3 !text-left">
                              <div className="w-10 h-10 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold shrink-0 border border-brand-gold/10">
                                <Briefcase size={20} />
                              </div>
                              <div className="flex flex-col items-start !text-left">
                                <p className="font-bold text-brand-text !text-left leading-tight">
                                  {deal.title}
                                </p>
                                <div className="flex items-center justify-start gap-1.5 text-[10px] text-brand-muted uppercase tracking-widest mt-1 !text-left">
                                  <TrendingUp size={12} className="shrink-0" />
                                  <span>
                                    {getDaysInStage(deal.stageUpdatedAt)} days
                                    in stage
                                  </span>
                                  {deal.opportunityType && (
                                    <>
                                      <span className="mx-1">•</span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded-md font-bold ${deal.opportunityType === "New" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-blue/10 text-brand-blue"}`}
                                      >
                                        {deal.opportunityType}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatCurrency(deal.value)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {deal.potentialGrossProfit !== undefined ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-brand-text">
                                  {deal.potentialGrossProfit}%
                                </span>
                                <span className="text-[10px] text-brand-muted font-normal">
                                  ≈{" "}
                                  {currencyService.formatIDR(
                                    deal.value *
                                      (deal.potentialGrossProfit / 100),
                                  )}
                                </span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${stageColors[deal.stage]}`}
                            >
                              {stageLabels[deal.stage]}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {deal.stage === "L2-proposal" ||
                            deal.stage === "L3-show-interest" ||
                            deal.stage === "L4-negotiation" ||
                            deal.stage === "L5-closed-won" ||
                            deal.technicalProposalUrl ||
                            deal.commercialProposalUrl ? (
                              <button
                                onClick={() => setSelectedDealForProposal(deal)}
                                className="flex flex-col items-start gap-1 py-1 transition-all hover:scale-105 cursor-pointer"
                              >
                                {deal.proposalStatus === "approved" ? (
                                  <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                    <CheckCircle2 size={12} />
                                    {deal.proposalSentToCustomer
                                      ? "Sent"
                                      : "Approved"}
                                  </span>
                                ) : deal.proposalStatus === "pending_approval" ? (
                                  <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                    <Clock size={12} />
                                    Pending Approval
                                  </span>
                                ) : deal.proposalStatus === "rejected" ? (
                                  <span className="flex items-center gap-1 bg-brand-red/10 text-brand-red border border-brand-red/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                    <XCircle size={12} />
                                    Rejected
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                    <FileText size={12} />
                                    Draft
                                  </span>
                                )}
                                <span className="text-[9px] font-semibold text-brand-muted/70 pl-1">
                                  {deal.proposalType === "commercial_and_technical" || (!deal.proposalType && deal.technicalProposalUrl)
                                    ? "Comm & Tech"
                                    : "Commercial only"}
                                </span>
                              </button>
                            ) : (
                              <span className="text-brand-muted/30 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 text-sm text-brand-muted font-medium">
                                <Calendar
                                  size={14}
                                  className="text-brand-gold/40"
                                />
                                <span>
                                  {deal.expectedCloseDate
                                    ? format(
                                        new Date(deal.expectedCloseDate),
                                        "MMM d, yyyy",
                                      )
                                    : "No date"}
                                </span>
                              </div>
                              {deal.expectedCloseQuarter && (
                                <span className="text-[10px] font-bold text-brand-gold/40 uppercase tracking-widest ml-5">
                                  {deal.expectedCloseQuarter}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(deal.stage === "L2-proposal" ||
                                deal.stage === "L3-show-interest" ||
                                deal.stage === "L4-negotiation" ||
                                deal.stage === "L5-closed-won" ||
                                deal.technicalProposalUrl ||
                                deal.commercialProposalUrl) && (
                                <button
                                  onClick={() => setSelectedDealForProposal(deal)}
                                  title={
                                    userRole === "admin"
                                      ? "Review & Approve Proposal"
                                      : "Proposal Details & Actions"
                                  }
                                  className={`p-1.5 rounded-lg transition-all ${
                                    deal.proposalStatus === "pending_approval" &&
                                    userRole === "admin"
                                      ? "text-brand-gold bg-brand-gold/20 ring-1 ring-brand-gold animate-pulse"
                                      : "text-brand-gold hover:bg-brand-gold/10"
                                  }`}
                                >
                                  <FileText size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedDealForSolutions(
                                    selectedDealForSolutions?.id === deal.id
                                      ? null
                                      : deal,
                                  );
                                  setSelectedDealForInteractions(null);
                                }}
                                title="View Products & Solutions"
                                className={`p-1.5 rounded-lg transition-all ${selectedDealForSolutions?.id === deal.id ? "bg-brand-gold text-brand-bg shadow-[0_0_15px_rgba(197,160,89,0.3)]" : "text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10"}`}
                              >
                                <Package size={16} />
                              </button>
                              <button
                                onClick={() => handleLogInteraction(deal)}
                                title="Log Interaction"
                                className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                              >
                                <PlusCircle size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedDealForInteractions(
                                    selectedDealForInteractions?.id === deal.id
                                      ? null
                                      : deal,
                                  );
                                  setSelectedDealForSolutions(null);
                                }}
                                title="View History"
                                className={`p-1.5 rounded-lg transition-all ${selectedDealForInteractions?.id === deal.id ? "bg-gold-gradient text-brand-bg" : "text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10"}`}
                              >
                                <History size={16} />
                              </button>
                              {deal.stage === "L5-closed-won" && (
                                <button
                                  onClick={() => handleCreatePO(deal)}
                                  title="Create Incoming PO"
                                  className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                                >
                                  <FilePlus size={16} />
                                </button>
                              )}
                              {(userRole === "admin" ||
                                userRole === "manager" ||
                                userRole === "super_user" ||
                                userRole === "engineer" ||
                                userRole === "finance" ||
                                userRole === "procurement" ||
                                userRole === "project_manager" ||
                                deal.ownerId === userId) && (
                                <>
                                  <button
                                    onClick={() => openEditModal(deal)}
                                    className="p-1.5 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  {userRole === "admin" && (
                                    <button
                                      onClick={() => handleDelete(deal.id)}
                                      className="p-1.5 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {selectedDealForInteractions?.id === deal.id && (
                          <tr className="bg-brand-bg/50">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="bg-brand-card rounded-2xl border border-brand-gold/20 shadow-2xl overflow-hidden">
                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                  <h4 className="text-sm font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider">
                                    <History
                                      size={16}
                                      className="text-brand-gold"
                                    />
                                    Interaction History
                                  </h4>
                                  <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    {
                                      interactions.filter(
                                        (i) => i.dealId === deal.id,
                                      ).length
                                    }{" "}
                                    Interactions
                                  </span>
                                </div>
                                <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                  {interactions
                                    .filter((i) => i.dealId === deal.id)
                                    .sort(
                                      (a, b) =>
                                        b.date.toMillis() - a.date.toMillis(),
                                    )
                                    .map((interaction) => (
                                      <div
                                        key={interaction.id}
                                        className="p-4 hover:bg-white/5 transition-colors"
                                      >
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex items-start gap-3">
                                            <div
                                              className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                                                interaction.kind === "Email"
                                                  ? "bg-brand-blue/10 text-brand-blue border-brand-blue/20"
                                                  : interaction.kind === "Call"
                                                    ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20"
                                                    : interaction.kind ===
                                                        "Meeting"
                                                      ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                                      : "bg-brand-red/10 text-brand-red border-brand-red/20"
                                              }`}
                                            >
                                              {getKindIcon(interaction.kind)}
                                            </div>
                                            <div className="flex flex-col items-start gap-1">
                                              <p className="font-bold text-brand-text text-base leading-tight">
                                                {interaction.subject}
                                              </p>
                                              <p className="text-sm text-brand-muted font-medium">
                                                {format(
                                                  interaction.date.toDate(),
                                                  "MMM d, yyyy",
                                                )}{" "}
                                                •{" "}
                                                {users.find(
                                                  (u) =>
                                                    u.uid ===
                                                    interaction.ownerId,
                                                )?.displayName || "Unknown"}
                                              </p>
                                              {interaction.description && (
                                                <p className="text-sm text-brand-text/70 mt-1.5 leading-relaxed line-clamp-2">
                                                  "{interaction.description}"
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  {interactions.filter(
                                    (i) => i.dealId === deal.id,
                                  ).length === 0 && (
                                    <div className="p-8 text-center text-slate-400 text-sm italic">
                                      No interactions recorded for this deal
                                      yet.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {selectedDealForSolutions?.id === deal.id && (
                          <tr className="bg-brand-bg/50">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="bg-brand-card rounded-2xl border border-brand-gold/20 shadow-2xl overflow-hidden">
                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                  <h4 className="text-sm font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider">
                                    <Package
                                      size={16}
                                      className="text-brand-gold"
                                    />
                                    Products & Solutions
                                  </h4>
                                  <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    { (deal.productSolutions?.length || 0) + (deal.productCategory ? 1 : 0) } Items
                                  </span>
                                </div>
                                <div className="p-6 bg-brand-bg/30">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {(deal.productSolutions && deal.productSolutions.length > 0) ? (
                                      deal.productSolutions.map((sol, idx) => (
                                        <div key={idx} className="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-brand-gold/30 transition-all group">
                                          <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-brand-gold/15 text-brand-gold border border-brand-gold/30 uppercase tracking-widest">
                                              {sol.category}
                                            </span>
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <span className="text-sm font-bold text-brand-text group-hover:text-brand-gold transition-colors">
                                              {sol.brand}
                                            </span>
                                            {sol.productType && (
                                              <div className="flex flex-wrap gap-1 mt-1">
                                                {sol.productType.split(',').map((type, tIdx) => (
                                                  <span key={tIdx} className="text-[10px] text-brand-muted font-medium bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                                    {type.trim()}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <>
                                        {(deal.productCategory || deal.productBrand || deal.productType) ? (
                                          <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-brand-gold/30 transition-all group">
                                            <div className="flex items-center gap-2">
                                              {deal.productCategory && (
                                                <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-brand-gold/15 text-brand-gold border border-brand-gold/30 uppercase tracking-widest">
                                                  {deal.productCategory}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                              {deal.productBrand && (
                                                <span className="text-sm font-bold text-brand-text group-hover:text-brand-gold transition-colors">
                                                  {deal.productBrand}
                                                </span>
                                              )}
                                              {deal.productType && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                  {deal.productType.split(',').map((type, tIdx) => (
                                                    <span key={tIdx} className="text-[10px] text-brand-muted font-medium bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                                      {type.trim()}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="col-span-full text-center py-8 bg-white/5 rounded-xl border border-dashed border-white/10">
                                            <Package size={32} className="mx-auto text-brand-muted/20 mb-2" />
                                            <p className="text-brand-muted italic text-sm">No products or solutions specified for this deal.</p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ),
              )}
              {filteredDeals.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-brand-muted"
                  >
                    No deals found. Create your first deal to start tracking
                    revenue!
                  </td>
                </tr>
              )}
            </tbody>
            {filteredDeals.length > 0 && (
              <tfoot className="border-t border-white/5">
                <tr className="bg-white/5">
                  <td colSpan={2} className="px-4 py-4 text-right">
                    <span className="text-[10px] font-black text-brand-gold uppercase tracking-[0.2em]">
                      Total Filtered
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {formatCurrency(totalFilteredValue)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-brand-muted font-bold uppercase tracking-widest leading-none mb-1">
                        Expected GP
                      </span>
                      <span className="font-bold text-brand-gold shadow-[0_0_10px_rgba(255,183,77,0.1)]">
                        {currencyService.formatIDR(totalFilteredGP)}
                      </span>
                      {totalFilteredValue > 0 && (
                        <span className="text-[10px] text-brand-gold/60 font-bold mt-1">
                          {(
                            (totalFilteredGP / totalFilteredValue) *
                            100
                          ).toFixed(1)}
                          % Blended
                        </span>
                      )}
                    </div>
                  </td>
                  <td colSpan={4} className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1 bg-brand-gold/10 rounded-md border border-brand-gold/20">
                        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
                          {filteredDeals.length} deals
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Deal"
        message="Are you sure you want to delete this deal? This action cannot be undone."
        isDeleting={isDeleting}
      />

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-5xl xl:max-w-6xl max-h-[96vh] bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden flex flex-col my-auto"
            >
              {/* Pinned Modal Header: Compact Single-Line */}
              <div className="flex-shrink-0 py-3.5 px-6 md:px-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center text-brand-gold">
                    <Briefcase size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-brand-text flex items-center gap-2">
                      {editingDeal ? "Edit Deal" : "Add New Deal"}
                      {editingDeal && (
                        <span className="text-xs text-brand-muted font-normal truncate max-w-xs">
                          • {editingDeal.title}
                        </span>
                      )}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20 hidden sm:inline-block">
                    {stageLabels[formData.stage]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 text-brand-muted hover:text-brand-text hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Form with Optimized No-Scroll 2-Column Grid */}
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 p-5 md:p-6 overflow-y-auto custom-scrollbar">
                  {/* Two Main Columns Side-by-Side: Left = Deal Info, Right = Proposal & Approvals */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    {/* Left Column: Deal Identity & Commercial Attributes */}
                    <div
                      className={`${
                        formData.stage === "L2-proposal" ||
                        formData.stage === "L3-show-interest" ||
                        formData.stage === "L4-negotiation" ||
                        formData.stage === "L5-closed-won" ||
                        formData.technicalProposalUrl ||
                        formData.commercialProposalUrl
                          ? "lg:col-span-6"
                          : "lg:col-span-12 max-w-3xl mx-auto"
                      } space-y-3`}
                    >
                      {/* Deal Title */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                          Deal Title *
                        </label>
                        <input
                          required
                          type="text"
                          value={formData.title}
                          onChange={(e) =>
                            setFormData({ ...formData, title: e.target.value })
                          }
                          placeholder="e.g. Enterprise Security Suite"
                          className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs font-medium"
                        />
                      </div>

                      {/* Row 1: Value & Expected Close */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                              Value (IDR) *
                            </label>
                            {usdRate && formData.value > 0 && (
                              <span className="text-[10px] text-brand-gold font-semibold">
                                ≈ {currencyService.formatUSD(formData.value * usdRate)}
                              </span>
                            )}
                          </div>
                          <input
                            required
                            type="number"
                            value={formData.value || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                value:
                                  e.target.value === ""
                                    ? 0
                                    : parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs"
                            placeholder="Amount in IDR"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                            Expected Close
                          </label>
                          <input
                            type="date"
                            value={formData.expectedCloseDate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                expectedCloseDate: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs [color-scheme:dark] theme-white-blue:[color-scheme:light]"
                          />
                        </div>
                      </div>

                      {/* Row 2: GP & Opportunity Type */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                              Potential GP (%)
                            </label>
                            {formData.potentialGrossProfit > 0 && formData.value > 0 && (
                              <span className="text-[10px] text-brand-gold font-semibold truncate">
                                ≈ {currencyService.formatIDR(formData.value * (formData.potentialGrossProfit / 100))}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={formData.potentialGrossProfit || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                potentialGrossProfit:
                                  e.target.value === ""
                                    ? 0
                                    : parseFloat(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs"
                            placeholder="e.g. 25"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                            Opportunity Type
                          </label>
                          <select
                            value={formData.opportunityType}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                opportunityType: e.target.value as "Renewal" | "New",
                              })
                            }
                            className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs cursor-pointer appearance-none"
                          >
                            <option value="New">New</option>
                            <option value="Renewal">Renewal</option>
                          </select>
                        </div>
                      </div>

                      {/* Row 3: Stage & Company */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                            Stage *
                          </label>
                          <select
                            value={formData.stage}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                stage: e.target.value as DealStage,
                              })
                            }
                            className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs cursor-pointer appearance-none"
                          >
                            {Object.entries(stageLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1 relative">
                          <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                            Company
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={companySearch}
                              onChange={(e) => {
                                setCompanySearch(e.target.value);
                                setIsCompanyDropdownOpen(true);
                                if (e.target.value === "") {
                                  setFormData({
                                    ...formData,
                                    companyId: "",
                                    contactId: "",
                                  });
                                }
                              }}
                              onFocus={() => setIsCompanyDropdownOpen(true)}
                              onBlur={() =>
                                setTimeout(
                                  () => setIsCompanyDropdownOpen(false),
                                  200,
                                )
                              }
                              placeholder="Search company..."
                              className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all text-xs pr-7"
                            />
                            <Search
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted/30"
                              size={14}
                            />
                          </div>
                          <AnimatePresence>
                            {isCompanyDropdownOpen && companySearch && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="absolute z-50 w-full mt-1 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar"
                              >
                                {filteredCompanies.length > 0 ? (
                                  filteredCompanies.map((company) => (
                                    <button
                                      key={company.id}
                                      type="button"
                                      onClick={() => handleSelectCompany(company)}
                                      className="w-full px-3 py-1.5 text-left text-brand-text hover:bg-white/5 transition-colors flex items-center justify-between group cursor-pointer text-xs"
                                    >
                                      <span className="truncate">{company.name}</span>
                                      {formData.companyId === company.id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-gold shrink-0 ml-1 shadow-[0_0_6px_rgba(197,160,89,0.5)]" />
                                      )}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-xs text-brand-muted italic">
                                    No companies found
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Row 4: Contact Person */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                          Contact Person
                        </label>
                        <select
                          disabled={!formData.companyId}
                          value={formData.contactId}
                          onChange={(e) =>
                            setFormData({ ...formData, contactId: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold transition-all disabled:opacity-50 appearance-none cursor-pointer text-xs"
                        >
                          <option value="">Select a contact</option>
                          {contacts
                            .filter((c) => c.companyId === formData.companyId)
                            .map((contact) => (
                              <option key={contact.id} value={contact.id}>
                                {contact.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Row 5: Product & Solution Section */}
                      <div className="pt-2 border-t border-white/5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-brand-gold uppercase tracking-wider flex items-center gap-1.5">
                            <Package size={13} />
                            Add Product & Solution
                          </label>
                        </div>

                        {/* Category Selector Tabs */}
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-brand-bg rounded-xl border border-white/5">
                          {PRODUCT_CATALOG.map((cat) => {
                            const isSelected = formData.productCategory === cat.category;
                            return (
                              <button
                                key={cat.category}
                                type="button"
                                onClick={() => {
                                  const newCat = isSelected ? "" : cat.category;
                                  setFormData({
                                    ...formData,
                                    productCategory: newCat,
                                    productBrand: "",
                                    productType: "",
                                  });
                                }}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all text-center truncate cursor-pointer ${
                                  isSelected
                                    ? "bg-brand-gold text-brand-bg shadow-sm"
                                    : "text-brand-muted hover:text-brand-text hover:bg-white/5"
                                }`}
                                title={cat.category}
                              >
                                {cat.category}
                              </button>
                            );
                          })}
                        </div>

                        {/* Brand & Product Type Selection */}
                        {formData.productCategory && (
                          <div className="space-y-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* Brand Dropdown */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                                  Brand / Service *
                                </label>
                                <select
                                  value={formData.productBrand}
                                  onChange={(e) => {
                                    const brand = e.target.value;
                                    setFormData({
                                      ...formData,
                                      productBrand: brand,
                                      productType: "",
                                    });
                                  }}
                                  className="w-full px-3 py-1.5 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold text-xs cursor-pointer appearance-none"
                                >
                                  <option value="">Select Brand / Service...</option>
                                  {getBrandsForCategory(formData.productCategory).map((b) => (
                                    <option key={b.name} value={b.name}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Product Type Input */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                                  Product Type
                                </label>
                                <input
                                  type="text"
                                  value={formData.productType || ""}
                                  onChange={(e) =>
                                    setFormData({ ...formData, productType: e.target.value })
                                  }
                                  placeholder="e.g. EDR, XDR, SecOps..."
                                  className="w-full px-3 py-1.5 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold text-xs"
                                />
                              </div>
                            </div>

                            {/* Preset Product Types Chips (if available for Brand) */}
                            {getProductTypesForBrand(formData.productCategory, formData.productBrand).length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-white/5">
                                <span className="text-[10px] text-brand-muted font-medium">Quick Select Types:</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {getProductTypesForBrand(formData.productCategory, formData.productBrand).map((type) => {
                                    const currentTypes = formData.productType
                                      ? formData.productType.split(",").map((t) => t.trim()).filter(Boolean)
                                      : [];
                                    const isTypeSelected = currentTypes.includes(type);
                                    return (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => {
                                          let nextTypes: string[];
                                          if (isTypeSelected) {
                                            nextTypes = currentTypes.filter((t) => t !== type);
                                          } else {
                                            nextTypes = [...currentTypes, type];
                                          }
                                          setFormData({
                                            ...formData,
                                            productType: nextTypes.join(", "),
                                          });
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${
                                          isTypeSelected
                                            ? "bg-brand-gold/20 text-brand-gold border-brand-gold/40 shadow-sm"
                                            : "bg-white/5 text-brand-muted border-white/10 hover:border-white/20 hover:text-brand-text"
                                        }`}
                                      >
                                        {type}
                                        {isTypeSelected && " ✓"}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={!formData.productCategory || !formData.productBrand}
                              onClick={() => {
                                if (formData.productCategory && formData.productBrand) {
                                  const newSolution: DealProductSolution = {
                                    id: Math.random().toString(36).substring(2, 9),
                                    category: formData.productCategory,
                                    brand: formData.productBrand,
                                    productType: formData.productType,
                                  };
                                  setFormData({
                                    ...formData,
                                    productSolutions: [...formData.productSolutions, newSolution],
                                    productCategory: "",
                                    productBrand: "",
                                    productType: "",
                                  });
                                }
                              }}
                              className="w-full py-1.5 mt-2 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-brand-gold/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              Add to Deal
                            </button>
                          </div>
                        )}

                        {/* List of Added Solutions */}
                        {formData.productSolutions.length > 0 && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                              Selected Products & Solutions ({formData.productSolutions.length})
                            </label>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                              {formData.productSolutions.map((sol, index) => (
                                <div key={sol.id || index} className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-xl group">
                                  <div className="flex flex-col gap-0.5 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-brand-gold uppercase">{sol.category}</span>
                                      <span className="text-[10px] font-medium text-brand-text truncate">{sol.brand}</span>
                                    </div>
                                    {sol.productType && (
                                      <span className="text-[9px] text-brand-muted truncate italic">{sol.productType}</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        productSolutions: formData.productSolutions.filter((_, i) => i !== index),
                                      });
                                    }}
                                    className="p-1 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: L2 Proposal Documents & PO Upload */}
                    {(formData.stage === "L2-proposal" ||
                      formData.stage === "L3-show-interest" ||
                      formData.stage === "L4-negotiation" ||
                      formData.stage === "L5-closed-won" ||
                      formData.technicalProposalUrl ||
                      formData.commercialProposalUrl) && (
                      <div className="lg:col-span-6 bg-brand-bg/60 p-4 rounded-xl border border-brand-gold/25 space-y-3">
                        {/* Section Header with status badge */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <div className="flex items-center gap-2">
                            <FileText size={15} className="text-brand-gold" />
                            <span className="text-xs font-bold text-brand-gold uppercase tracking-wider">
                              L2 Proposal Documents
                            </span>
                            {formData.stage === "L2-proposal" && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold">
                                Required
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              formData.proposalStatus === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : formData.proposalStatus === "pending_approval"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : formData.proposalStatus === "rejected"
                                    ? "bg-brand-red/10 text-brand-red border border-brand-red/20"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {formData.proposalStatus === "approved"
                              ? "✓ Approved"
                              : formData.proposalStatus === "pending_approval"
                                ? "⏳ Pending"
                                : formData.proposalStatus === "rejected"
                                  ? "✕ Rejected"
                                  : "📝 Draft"}
                          </span>
                        </div>

                        {/* Proposal Requirement Selector: Compact Segmented Switch */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                              Proposal Requirement *
                            </label>
                            <span className="text-[10px] text-brand-muted/70">
                              {formData.proposalType === "commercial_only" || !formData.proposalType
                                ? "Only Commercial PDF needed"
                                : "Both PDF files required"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 bg-brand-bg p-1 rounded-xl border border-white/10">
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  proposalType: "commercial_only",
                                }))
                              }
                              className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                formData.proposalType === "commercial_only" || !formData.proposalType
                                  ? "bg-brand-gold text-brand-bg font-bold shadow-sm"
                                  : "text-brand-muted hover:text-brand-text hover:bg-white/5"
                              }`}
                            >
                              <DollarSign size={13} />
                              <span>Commercial Only</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  proposalType: "commercial_and_technical",
                                }))
                              }
                              className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                formData.proposalType === "commercial_and_technical"
                                  ? "bg-brand-gold text-brand-bg font-bold shadow-sm"
                                  : "text-brand-muted hover:text-brand-text hover:bg-white/5"
                              }`}
                            >
                              <ShieldCheck size={13} />
                              <span>Comm & Technical</span>
                            </button>
                          </div>
                        </div>

                        {/* Proposal Upload Boxes: Compact 2-column cards */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Commercial Proposal */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider flex items-center gap-1 truncate">
                                <DollarSign size={12} className="text-brand-gold shrink-0" />
                                Commercial *
                              </label>
                              {formData.commercialProposalUrl && (
                                <a
                                  href={formData.commercialProposalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] font-bold text-brand-gold hover:underline flex items-center gap-0.5 shrink-0"
                                >
                                  View <ExternalLink size={8} />
                                </a>
                              )}
                            </div>
                            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-white/10 rounded-xl hover:bg-white/5 hover:border-brand-gold/50 transition-all cursor-pointer relative overflow-hidden group">
                              {isUploadingComm ? (
                                <div className="flex flex-col items-center gap-1 px-2 text-center w-full">
                                  <div className="w-24 h-1.5 bg-brand-bg rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-gold-gradient"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${uploadCommProgress}%` }}
                                    />
                                  </div>
                                  <p className="text-[9px] font-bold text-brand-gold">
                                    {Math.round(uploadCommProgress)}%
                                  </p>
                                </div>
                              ) : formData.commercialProposalUrl ? (
                                <div className="flex flex-col items-center gap-1 text-emerald-400 px-2 text-center">
                                  <CheckCircle2 size={18} />
                                  <p className="text-[10px] font-bold truncate max-w-[120px]">
                                    {formData.commercialProposalName || "Uploaded"}
                                  </p>
                                  <p className="text-[8px] uppercase tracking-wider text-brand-muted group-hover:text-brand-gold">
                                    Replace
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-brand-muted group-hover:text-brand-gold px-2 text-center">
                                  <PlusCircle size={18} />
                                  <p className="text-[11px] font-bold leading-tight">Upload Commercial</p>
                                  <p className="text-[8px] uppercase tracking-wider opacity-60">Mandatory PDF</p>
                                </div>
                              )}
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={handleCommProposalUpload}
                                disabled={isUploadingComm}
                              />
                            </label>
                          </div>

                          {/* Technical Proposal */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider flex items-center gap-1 truncate">
                                <ShieldCheck size={12} className="text-brand-gold shrink-0" />
                                Technical {formData.proposalType === "commercial_and_technical" ? "*" : ""}
                              </label>
                              {formData.technicalProposalUrl && (
                                <a
                                  href={formData.technicalProposalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] font-bold text-brand-gold hover:underline flex items-center gap-0.5 shrink-0"
                                >
                                  View <ExternalLink size={8} />
                                </a>
                              )}
                            </div>
                            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-white/10 rounded-xl hover:bg-white/5 hover:border-brand-gold/50 transition-all cursor-pointer relative overflow-hidden group">
                              {isUploadingTech ? (
                                <div className="flex flex-col items-center gap-1 px-2 text-center w-full">
                                  <div className="w-24 h-1.5 bg-brand-bg rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-gold-gradient"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${uploadTechProgress}%` }}
                                    />
                                  </div>
                                  <p className="text-[9px] font-bold text-brand-gold">
                                    {Math.round(uploadTechProgress)}%
                                  </p>
                                </div>
                              ) : formData.technicalProposalUrl ? (
                                <div className="flex flex-col items-center gap-1 text-emerald-400 px-2 text-center">
                                  <CheckCircle2 size={18} />
                                  <p className="text-[10px] font-bold truncate max-w-[120px]">
                                    {formData.technicalProposalName || "Uploaded"}
                                  </p>
                                  <p className="text-[8px] uppercase tracking-wider text-brand-muted group-hover:text-brand-gold">
                                    Replace
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-brand-muted group-hover:text-brand-gold px-2 text-center">
                                  <PlusCircle size={18} />
                                  <p className="text-[11px] font-bold leading-tight">Upload Technical</p>
                                  <p className="text-[8px] uppercase tracking-wider opacity-60">
                                    {formData.proposalType === "commercial_and_technical" ? "Required PDF" : "Optional PDF"}
                                  </p>
                                </div>
                              )}
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={handleTechProposalUpload}
                                disabled={isUploadingTech}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Rejection / Status notice */}
                        {formData.proposalStatus === "rejected" && formData.proposalRejectionReason ? (
                          <div className="p-2 bg-brand-red/10 border border-brand-red/30 rounded-lg text-[11px] text-brand-red font-medium flex items-center gap-1.5">
                            <AlertCircle size={13} className="shrink-0" />
                            <span className="truncate">Feedback: {formData.proposalRejectionReason}</span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-brand-muted flex items-center gap-1">
                            <AlertCircle size={11} className="text-brand-gold shrink-0" />
                            <span>Saved as Draft; Admin must approve before sending to client.</span>
                          </p>
                        )}

                        {/* Admin Controls & Customer Sent Checkbox */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                          {userRole === "admin" && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-brand-gold uppercase tracking-wider">
                                Admin:
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    proposalStatus: "approved",
                                    proposalApprovedBy: userId,
                                    proposalApproverName:
                                      users.find((u) => u.uid === userId)?.displayName || "Admin",
                                    proposalApprovedAt: Timestamp.now(),
                                    proposalRejectionReason: "",
                                  }));
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                  formData.proposalStatus === "approved"
                                    ? "bg-emerald-500 text-brand-bg shadow-sm"
                                    : "bg-white/5 text-emerald-400 hover:bg-emerald-500/20"
                                }`}
                              >
                                ✓ Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const reason = prompt("Enter reason for rejection:");
                                  if (reason) {
                                    setFormData((prev) => ({
                                      ...prev,
                                      proposalStatus: "rejected",
                                      proposalRejectionReason: reason,
                                    }));
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                  formData.proposalStatus === "rejected"
                                    ? "bg-brand-red text-white shadow-sm"
                                    : "bg-white/5 text-brand-red hover:bg-brand-red/20"
                                }`}
                              >
                                ✕ Reject
                              </button>
                            </div>
                          )}

                          {formData.proposalStatus === "approved" && (
                            <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                              <input
                                type="checkbox"
                                checked={!!formData.proposalSentToCustomer}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    proposalSentToCustomer: e.target.checked,
                                    proposalSentAt: e.target.checked ? Timestamp.now() : null,
                                  }))
                                }
                                className="w-3.5 h-3.5 rounded text-brand-gold focus:ring-brand-gold"
                              />
                              <span className="text-[11px] text-purple-300 font-medium">
                                Sent to Customer
                              </span>
                            </label>
                          )}
                        </div>

                        {/* PO Document Upload if L5-closed-won */}
                        {formData.stage === "L5-closed-won" && (
                          <div className="pt-2 border-t border-white/5 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-bold text-brand-gold uppercase tracking-wider text-[10px]">
                                PO Document Upload *
                              </label>
                              {formData.poDocumentUrl && (
                                <a
                                  href={formData.poDocumentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] text-brand-gold hover:underline flex items-center gap-1"
                                >
                                  View PO <ExternalLink size={8} />
                                </a>
                              )}
                            </div>
                            <label className="flex items-center justify-center w-full h-14 border-2 border-dashed border-white/10 rounded-xl hover:bg-white/5 hover:border-brand-gold/50 transition-all cursor-pointer relative overflow-hidden group">
                              {isUploading ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-24 h-1.5 bg-brand-bg rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full bg-gold-gradient"
                                      initial={{ width: 0 }}
                                      animate={{ width: `${uploadProgress}%` }}
                                    />
                                  </div>
                                  <p className="text-[9px] font-bold text-brand-gold">
                                    {Math.round(uploadProgress)}%
                                  </p>
                                </div>
                              ) : formData.poDocumentUrl ? (
                                <div className="flex items-center gap-2 text-emerald-400">
                                  <Check size={14} />
                                  <span className="text-[11px] font-bold truncate max-w-[150px]">
                                    {formData.poDocumentName || "PO Uploaded"}
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wider text-brand-muted group-hover:text-brand-gold">
                                    Replace
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-brand-muted group-hover:text-brand-gold">
                                  <PlusCircle size={14} />
                                  <span className="text-xs font-bold">Upload PO PDF (Required)</span>
                                </div>
                              )}
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={handleFileUpload}
                                disabled={isUploading}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pinned Modal Footer */}
                <div className="flex-shrink-0 py-3 px-6 md:px-8 border-t border-white/10 bg-brand-card/95 backdrop-blur-md flex items-center justify-between gap-4 z-10">
                  <div className="text-xs text-brand-muted hidden sm:flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-gold" />
                    <span>Stage: <strong className="text-brand-text">{stageLabels[formData.stage]}</strong></span>
                  </div>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 sm:flex-none px-5 py-2 border border-white/10 text-brand-muted hover:text-brand-text font-bold text-xs rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none px-7 py-2 bg-gold-gradient text-brand-bg font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-brand-gold/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {editingDeal ? "Save Changes" : "Create Deal"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isInteractionModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInteractionModalOpen(false)}
              className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold border border-brand-gold/20">
                    <PlusCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-brand-text">
                      Log Interaction
                    </h3>
                    <p className="text-sm text-brand-muted uppercase tracking-wider">
                      For Deal: {selectedDealForInteractions?.title}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsInteractionModalOpen(false)}
                  className="p-2 text-brand-muted hover:text-brand-text hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {interactionError && (
                <div className="mx-8 mt-8 p-4 bg-brand-red/10 border border-brand-red/20 text-brand-red rounded-xl text-sm font-medium">
                  {interactionError}
                </div>
              )}

              <form
                onSubmit={handleInteractionSubmit}
                className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                      Interaction Kind *
                    </label>
                    <select
                      required
                      value={interactionFormData.kind}
                      onChange={(e) =>
                        setInteractionFormData({
                          ...interactionFormData,
                          kind: e.target.value as InteractionKind,
                        })
                      }
                      className="w-full px-4 py-3 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all appearance-none"
                    >
                      <option value="Email">Email</option>
                      <option value="Call">Call</option>
                      <option value="Meeting">Meeting</option>
                      <option value="Notes">Notes</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                      Date *
                    </label>
                    <input
                      required
                      type="date"
                      value={interactionFormData.date}
                      onChange={(e) =>
                        setInteractionFormData({
                          ...interactionFormData,
                          date: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all [color-scheme:dark] theme-white-blue:[color-scheme:light]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                    Contact *
                  </label>
                  <select
                    required
                    value={interactionFormData.contactId}
                    onChange={(e) =>
                      setInteractionFormData({
                        ...interactionFormData,
                        contactId: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all appearance-none"
                  >
                    <option value="">Select Contact...</option>
                    {contacts
                      .filter(
                        (c) =>
                          c.companyId ===
                          selectedDealForInteractions?.companyId,
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                    Subject *
                  </label>
                  <input
                    required
                    type="text"
                    maxLength={200}
                    value={interactionFormData.subject}
                    onChange={(e) =>
                      setInteractionFormData({
                        ...interactionFormData,
                        subject: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all"
                    placeholder="e.g., Technical discovery session"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={interactionFormData.description}
                    onChange={(e) =>
                      setInteractionFormData({
                        ...interactionFormData,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-brand-bg border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all resize-none"
                    placeholder="General notes about the interaction..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-cyan uppercase tracking-widest flex items-center gap-2">
                      <Lightbulb size={14} />
                      Highlights
                    </label>
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={interactionFormData.highlights}
                      onChange={(e) =>
                        setInteractionFormData({
                          ...interactionFormData,
                          highlights: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-brand-cyan/5 border border-brand-cyan/20 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-cyan/20 transition-all resize-none"
                      placeholder="Positive outcomes, key interests, or next steps..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-red uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Key Findings
                    </label>
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={interactionFormData.findings}
                      onChange={(e) =>
                        setInteractionFormData({
                          ...interactionFormData,
                          findings: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-brand-red/5 border border-brand-red/20 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-red/20 transition-all resize-none"
                      placeholder="Concerns, blockers, or critical information discovered..."
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsInteractionModalOpen(false)}
                    className="flex-1 px-6 py-4 border border-white/10 text-brand-muted font-bold rounded-2xl hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-4 bg-gold-gradient text-brand-bg font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-brand-gold/20"
                  >
                    Log Interaction
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* L2 Proposal Review & Approval Modal */}
      <AnimatePresence>
        {selectedDealForProposal && (
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDealForProposal(null)}
              className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl lg:max-w-5xl max-h-[96vh] bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden flex flex-col my-auto"
            >
              {/* Modal Header */}
              <div className="flex-shrink-0 py-3.5 px-6 md:px-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center text-brand-gold">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-brand-text flex items-center gap-2">
                      L2 Proposal Review & Approval
                      <span className="text-xs text-brand-muted font-normal truncate max-w-xs">
                        • {selectedDealForProposal.title} ({getCompanyName(selectedDealForProposal.companyId)})
                      </span>
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDealForProposal(null)}
                  className="p-1.5 text-brand-muted hover:text-brand-text hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 custom-scrollbar">
                {/* Status Banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    selectedDealForProposal.proposalStatus === "approved"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : selectedDealForProposal.proposalStatus === "pending_approval"
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                        : selectedDealForProposal.proposalStatus === "rejected"
                          ? "bg-brand-red/10 border-brand-red/30 text-brand-red"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0">
                      {selectedDealForProposal.proposalStatus === "approved" ? (
                        <CheckCircle2 size={18} />
                      ) : selectedDealForProposal.proposalStatus === "pending_approval" ? (
                        <Clock size={18} />
                      ) : selectedDealForProposal.proposalStatus === "rejected" ? (
                        <XCircle size={18} />
                      ) : (
                        <FileText size={18} />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xs tracking-wide">
                        {selectedDealForProposal.proposalStatus === "approved" &&
                          "✓ Proposal Approved by Admin"}
                        {selectedDealForProposal.proposalStatus === "pending_approval" &&
                          "⏳ Pending Admin Approval"}
                        {selectedDealForProposal.proposalStatus === "rejected" &&
                          "✕ Proposal Rejected by Admin"}
                        {(!selectedDealForProposal.proposalStatus ||
                          selectedDealForProposal.proposalStatus === "draft") &&
                          "📝 Proposal in Draft Status"}
                      </div>
                      <p className="text-[11px] text-brand-muted mt-0.5">
                        {selectedDealForProposal.proposalStatus === "approved" &&
                          (selectedDealForProposal.proposalApproverName
                            ? `Approved by ${selectedDealForProposal.proposalApproverName}. Ready to send to customer.`
                            : "Approved by Admin. Ready to send to customer.")}
                        {selectedDealForProposal.proposalStatus === "pending_approval" &&
                          "Submitted for review. Needs Admin approval before sending to customer."}
                        {selectedDealForProposal.proposalStatus === "rejected" && (
                          <span>
                            Feedback:{" "}
                            <strong className="text-brand-text">
                              {selectedDealForProposal.proposalRejectionReason ||
                                "Please revise proposal documents."}
                            </strong>
                          </span>
                        )}
                        {(!selectedDealForProposal.proposalStatus ||
                          selectedDealForProposal.proposalStatus === "draft") &&
                          "Proposals are in Draft. Must be submitted and approved by Admin."}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 shrink-0">
                    {selectedDealForProposal.proposalStatus || "draft"}
                  </span>
                </div>

                {/* Proposals Documents */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                      Proposal Documents
                    </h4>
                    <span className="text-[10px] font-bold text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20 flex items-center gap-1">
                      {selectedDealForProposal.proposalType === "commercial_and_technical" ||
                      (!selectedDealForProposal.proposalType && selectedDealForProposal.technicalProposalUrl) ? (
                        <>
                          <ShieldCheck size={12} />
                          Requirement: Commercial & Technical
                        </>
                      ) : (
                        <>
                          <DollarSign size={12} />
                          Requirement: Commercial Only
                        </>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Commercial Proposal */}
                    <div className="p-3 bg-brand-bg rounded-xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-text flex items-center gap-1.5 uppercase tracking-wider">
                          <DollarSign size={14} className="text-brand-gold" />
                          Commercial Proposal
                          <span className="text-[10px] text-amber-400 font-semibold">(Mandatory)</span>
                        </span>
                        {selectedDealForProposal.commercialProposalUrl && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Uploaded
                          </span>
                        )}
                      </div>
                      {selectedDealForProposal.commercialProposalUrl ? (
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className="text-xs text-brand-muted truncate"
                            title={selectedDealForProposal.commercialProposalName}
                          >
                            {selectedDealForProposal.commercialProposalName ||
                              "Commercial_Proposal.pdf"}
                          </p>
                          <a
                            href={selectedDealForProposal.commercialProposalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-gold/10 hover:bg-brand-gold/20 text-brand-gold font-bold text-xs rounded-lg transition-colors border border-brand-gold/20 shrink-0"
                          >
                            <Download size={12} />
                            View
                          </a>
                        </div>
                      ) : (
                        <div className="text-xs text-brand-red flex items-center gap-1 py-1">
                          <AlertTriangle size={14} />
                          Not uploaded yet
                        </div>
                      )}
                    </div>

                    {/* Technical Proposal */}
                    <div className="p-3 bg-brand-bg rounded-xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-text flex items-center gap-1.5 uppercase tracking-wider">
                          <ShieldCheck size={14} className="text-brand-gold" />
                          Technical Proposal
                          {selectedDealForProposal.proposalType === "commercial_and_technical" ||
                          (!selectedDealForProposal.proposalType && selectedDealForProposal.technicalProposalUrl) ? (
                            <span className="text-[10px] text-amber-400 font-semibold">(Mandatory)</span>
                          ) : (
                            <span className="text-[10px] text-brand-muted font-normal">(Optional)</span>
                          )}
                        </span>
                        {selectedDealForProposal.technicalProposalUrl ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Uploaded
                          </span>
                        ) : selectedDealForProposal.proposalType === "commercial_only" ||
                          (!selectedDealForProposal.proposalType && !selectedDealForProposal.technicalProposalUrl) ? (
                          <span className="text-[10px] font-bold text-brand-muted bg-white/5 px-2 py-0.5 rounded border border-white/10">
                            Not Required
                          </span>
                        ) : null}
                      </div>
                      {selectedDealForProposal.technicalProposalUrl ? (
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className="text-xs text-brand-muted truncate"
                            title={selectedDealForProposal.technicalProposalName}
                          >
                            {selectedDealForProposal.technicalProposalName ||
                              "Technical_Proposal.pdf"}
                          </p>
                          <a
                            href={selectedDealForProposal.technicalProposalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-gold/10 hover:bg-brand-gold/20 text-brand-gold font-bold text-xs rounded-lg transition-colors border border-brand-gold/20 shrink-0"
                          >
                            <Download size={12} />
                            View
                          </a>
                        </div>
                      ) : selectedDealForProposal.proposalType === "commercial_only" ||
                        (!selectedDealForProposal.proposalType && !selectedDealForProposal.technicalProposalUrl) ? (
                        <div className="text-xs text-brand-muted flex items-center gap-1 py-1">
                          Commercial only proposal selected; technical proposal is optional.
                        </div>
                      ) : (
                        <div className="text-xs text-brand-red flex items-center gap-1 py-1">
                          <AlertTriangle size={14} />
                          Not uploaded yet (Required)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer Delivery & Admin Controls in single row or compact cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  {/* Customer Delivery Status */}
                  <div className="p-3 bg-brand-bg rounded-xl border border-white/10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedDealForProposal.proposalSentToCustomer
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-white/5 text-brand-muted"
                        }`}
                      >
                        <Send size={14} />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-brand-text truncate">
                          Customer Delivery
                        </h5>
                        <p className="text-[10px] text-brand-muted truncate">
                          {selectedDealForProposal.proposalSentToCustomer
                            ? "Sent to customer"
                            : selectedDealForProposal.proposalStatus === "approved"
                              ? "Ready to send"
                              : "Needs approval first"}
                        </p>
                      </div>
                    </div>

                    {selectedDealForProposal.proposalStatus === "approved" ? (
                      !selectedDealForProposal.proposalSentToCustomer ? (
                        <button
                          onClick={() =>
                            handleSendToCustomer(selectedDealForProposal)
                          }
                          className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold text-xs rounded-lg transition-all flex items-center gap-1 border border-purple-500/30 cursor-pointer shrink-0"
                        >
                          <Send size={12} />
                          Send
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider border border-purple-500/30 shrink-0">
                          Delivered
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold text-brand-muted/70 bg-white/5 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider shrink-0">
                        <Lock size={10} />
                        Locked
                      </span>
                    )}
                  </div>

                  {/* Admin Approval Action Section */}
                  {userRole === "admin" ? (
                    <div className="p-3 bg-brand-gold/10 rounded-xl border border-brand-gold/30 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-brand-gold uppercase tracking-wider shrink-0">
                        Admin:
                      </span>
                      <div className="flex items-center gap-2">
                        {selectedDealForProposal.proposalStatus !== "approved" ? (
                          <button
                            onClick={() =>
                              handleApproveProposal(selectedDealForProposal)
                            }
                            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-brand-bg font-bold text-xs rounded-lg shadow transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Check size={14} />
                            Approve
                          </button>
                        ) : (
                          <div className="text-xs text-emerald-400 font-bold">
                            ✓ Approved
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setIsRejectModalOpen(true);
                          }}
                          className="px-3 py-1 bg-brand-red/10 hover:bg-brand-red/20 text-brand-red border border-brand-red/20 font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <X size={13} />
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : selectedDealForProposal.proposalStatus !== "approved" &&
                    selectedDealForProposal.proposalStatus !== "pending_approval" ? (
                    <button
                      onClick={() =>
                        handleSubmitProposalForApproval(selectedDealForProposal)
                      }
                      disabled={
                        !selectedDealForProposal.commercialProposalUrl ||
                        ((selectedDealForProposal.proposalType === "commercial_and_technical" ||
                          (!selectedDealForProposal.proposalType && selectedDealForProposal.technicalProposalUrl)) &&
                          !selectedDealForProposal.technicalProposalUrl)
                      }
                      className="w-full py-2 bg-gold-gradient text-brand-bg font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md shadow-brand-gold/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Clock size={14} />
                      Submit for Admin Approval
                    </button>
                  ) : (
                    <div className="text-xs text-brand-muted text-center py-2 bg-white/5 rounded-xl border border-white/5">
                      Proposal workflow active
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer: Pinned at bottom */}
              <div className="flex-shrink-0 py-2.5 px-6 md:px-8 border-t border-white/10 bg-brand-card/95 backdrop-blur-md flex items-center justify-between gap-4 z-10">
                <button
                  onClick={() => {
                    const d = selectedDealForProposal;
                    setSelectedDealForProposal(null);
                    openEditModal(d);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-brand-gold hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 size={13} />
                  Edit Deal & Replace Files
                </button>
                <button
                  onClick={() => setSelectedDealForProposal(null)}
                  className="px-5 py-1.5 border border-white/10 text-brand-muted hover:text-brand-text font-bold text-xs rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reject Proposal Modal */}
      <AnimatePresence>
        {isRejectModalOpen && selectedDealForProposal && (
          <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRejectModalOpen(false)}
              className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-brand-card rounded-2xl shadow-2xl border border-brand-red/30 p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-red/10 border border-brand-red/20 flex items-center justify-center text-brand-red">
                  <XCircle size={22} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-brand-text">
                    Reject Proposal
                  </h4>
                  <p className="text-xs text-brand-muted">
                    Specify feedback for Sales revision
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block mb-1.5">
                  Rejection Reason / Revision Notes *
                </label>
                <textarea
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Technical specifications missing failover architecture; commercial pricing requires margin adjustment..."
                  className="w-full px-3 py-2 bg-brand-bg border border-white/10 rounded-xl text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    setRejectionReasonInput("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-white/10 text-brand-muted font-bold text-xs rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDealForProposal) {
                      handleRejectProposal(
                        selectedDealForProposal,
                        rejectionReasonInput,
                      );
                    }
                  }}
                  disabled={!rejectionReasonInput.trim()}
                  className="flex-1 px-4 py-2.5 bg-brand-red hover:bg-brand-red/80 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Deals;
