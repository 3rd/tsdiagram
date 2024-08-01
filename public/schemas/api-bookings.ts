export interface IUserTrackingFields {
  createdBy?: string;
  updatedBy?: string;
}

export interface INameFields {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName?: string;
}

export interface IAgentContact extends IUserTrackingFields {
  agentId: Uuid;
  preferredName: INameFields;
  initials?: string;
  department?: string;
  departmentGroup?: string;
  userType?: string;
  office?: string;
  isDeal?: boolean;
  isPoint?: boolean;
  isActive?: boolean;
}

export interface IAssociatedTeam extends IUserTrackingFields {
  clientId: Uuid;
  preferredName: INameFields;
  bookingNumber?: string;
  share?: number;
  note?: string;
  isDeleted?: boolean;
}

export interface IBonus extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  applicableAgainstContComp?: boolean;
  note?: string;
  year?: number;
  startDate?: Date;
  detail?: string;
  isPaySchedule?: boolean;
  capDate?: Date;
  payDate?: Date;
  isCumulative?: boolean;
  ticketSold?: number;
  localCurrencyAmt?: number;
}

export interface IBuyer {
  buyerId: Uuid;
  companyName?: string;
  profileImagePath?: string;
}

export interface ICustomPay extends IUserTrackingFields {
  year?: number;
  amount?: number;
}

export interface ITeam extends IUserTrackingFields {
  name?: string;
  amount?: number;
  share?: string;
  perAnnum?: number;
  customPays?: ICustomPay[];
}

export interface ICompensation extends IUserTrackingFields {
  dealType?: string;
  term?: string;
  type?: string;
  length?: number;
  paymentTerm?: string;
  amount?: number;
  share?: string;
  periodicAmt?: number;
  firstDueDate?: Date;
  detail?: string;
  cadence?: string;
  cadenceLength?: number;
  perCadenceAmt?: number;
  startDate?: Date;
  endDate?: Date;
  noticeDate?: Date;
  note?: string;
  role?: string;
  isPayToPlay?: boolean;
  year?: number;
  triggerDate?: Date;
  teams?: ITeam[];
}

export interface IClient {
  clientId: Uuid;
  preferredName: INameFields;
}

export interface IContact extends IUserTrackingFields {
  contactId: Uuid;
  preferredName: INameFields;
  companyName?: string;
  jobTitle?: string;
  profileImagePath?: string;
}

export interface IContigent extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  note?: string;
}

export interface ILoanout extends IContact {
  // Inherits from IContact
}

export interface IOpportunity {
  opportunityId: Uuid;
  opportunityName?: string;
  wmeOpportunityId?: string;
}

export interface IParticipant extends IUserTrackingFields {
  participantName?: string;
  participantType?: string;
  defaultRate?: number;
  adjustment?: number;
  note?: string;
}

export interface IProject {
  projectId: Uuid;
  projectName?: string;
  wmeProjectId?: string;
}

export interface IPackageSeries extends IUserTrackingFields {
  projectId: Uuid;
  projectName?: string;
  wmeProjectId?: string;
  formats?: string[];
  note?: string;
}

export interface ITerm extends IUserTrackingFields {
  term?: string;
  type?: string;
  amount?: number;
  length?: string;
  share?: string;
  detail?: string;
  dsRightsnote?: string;
  countries?: string[];
  renewalTerms?: string;
  paymentTerms?: string;
  isGuaranteedStep?: boolean;
  formula?: string;
  avgAnnualAmt?: number;
  triggerDate?: Date;
  note?: string;
}

export interface IInvoiceInfo {
  invoicePayor?: string;
  invoiceContactName?: string;
  invoicePhone?: string;
  invoiceCountryCode?: string;
  invoiceEmail?: string;
}

export interface IRecoupability extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  perAnnum?: number;
  note?: string;
}

export interface IExpanse extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  note?: string;
  maxAmt?: number;
  ticketPrice?: number;
  atBreakEvenAtm?: number;
  atSoldOutAmt?: number;
}

export interface IDerivative extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  note?: string;
}

export interface IRenewalTerm extends IUserTrackingFields {
  term?: string;
  amount?: number;
  share?: string;
  noticeDate?: Date;
  note?: string;
}

export interface IWmeFee extends IUserTrackingFields {
  term?: string;
  salesFee?: number;
  deferStatus?: string;
  projectFee?: number;
  commission?: number;
  flatFee?: number;
  note?: string;
}

export interface IKeyDate extends IUserTrackingFields {
  term?: string;
  type?: string;
  startDate?: Date;
  note?: string;
}

export interface IBackendReport extends IUserTrackingFields {
  term?: string;
  type?: string;
  length?: number;
  note?: string;
}

export interface ISalaries extends IUserTrackingFields {
  year?: number;
  amount?: number;
  triggerDate?: Date;
  detail?: Date;
  weeks?: number;
  duration?: string;
  note?: string;
}

export interface ISportTerms extends IUserTrackingFields {
  term?: string;
  length?: number;
  amount?: number;
  avgAnnualAmt?: number;
  triggerDate?: Date;
  detail?: Date;
  note?: string;
}

export interface IIncentive extends IUserTrackingFields {
  term?: string;
  year?: number;
  amount?: number;
  startDate?: Date;
  isImmedInvoice?: boolean;
  isCommisionable?: boolean;
  note?: string;
}

export interface IFringes extends IUserTrackingFields {
  term?: string;
  amount?: number;
  note?: string;
}

export interface ILiqDamage extends IUserTrackingFields {
  year?: number;
  amount?: number;
  condition?: string;
  adjustment?: string;
  qualification?: string;
  paySchedule?: string;
  migrOffsetTerm?: string;
}

export interface IProxyBuyer extends IBuyer {
  // Inherits from IBuyer
}

export interface ICoPromoter extends IBuyer {
  // Inherits from IBuyer
}

export interface INotes {
  typeString?: string;
  noteText?: string;
}

export interface IDealEnteredBy {
  agentId?: Uuid;
  preferredName?: {
    fullName?: string;
  };
}

export interface IReimbExpanse extends IUserTrackingFields {
  artist?: string;
  amount?: string;
  date?: string;
  note?: string;
}

export interface IDeposit extends IUserTrackingFields {
  artist?: string;
  amount?: string;
  date?: string;
  note?: string;
}

export interface IMerchRate extends IUserTrackingFields {
  type?: string;
  whoSells?: string;
  share?: number;
  note?: string;
}

export interface IDealTracker extends IUserTrackingFields {
  status?: string;
  date?: Date;
  note?: string;
}

export interface INonCommissionableArea extends IUserTrackingFields {
  term?: string;
  note?: string;
}

export interface IOption extends IUserTrackingFields {
  type?: string;
  amount?: number;
  date?: Date;
  note?: string;
}

export interface IRoyalty extends IUserTrackingFields {
  type?: string;
  amount?: number;
  date?: Date;
  note?: string;
}

export interface IEquity extends IUserTrackingFields {
  type?: string;
  sector?: "Public" | "Private";
  amount?: number;
  date?: Date;
  note?: string;
}

export interface IDealMemo extends IUserTrackingFields {
  confirmingEmail?: string;
  fileName?: string;
  dateAdded?: Date;
  note?: string;
}

export interface IBooking {
  _id: RandomUuid;
  advertisingBudget?: number;
  agentContacts?: IAgentContact[];
  applicableAgainstContComp?: boolean;
  associatedTeams?: IAssociatedTeam[];
  associatedBookings?: IPackageSeries[];
  incentives?: IIncentive[];
  backendReports?: IBackendReport[];
  buyer?: IBuyer;
  buyerContacts?: IContact[];
  buyerParentCompany?: IBuyer;
  buyerBusinessAffairsContacts?: IContact[];
  bookingNumber?: string;
  bookingArea?: string;
  bookingSubArea?: string;
  bookingRole?: string;
  bookingDealType?: string;
  billing?: string;
  billingCycle?: string;
  bonuses?: IBonus[];
  budgetQualifiers?: string[];
  client?: IClient;
  clientBillingContacts?: IContact[];
  commitmentNote?: string;
  currency?: string;
  credit?: string;
  compensations?: ICompensation[];
  contingentComp?: string;
  contigents?: IContigent[];
  coPromoter?: ICoPromoter;
  department?: string;
  departmentGroup?: string;
  derivatives?: IDerivative[];
  dealEnteredBy?: IDealEnteredBy;
  distance?: number;
  distanceUnit?: string;
  daysAfter?: number;
  daysBefore?: number;
  dealStructure?: string;
  deposits?: IDeposit[];
  dealMemo?: IDealMemo[];
  dealTrackers?: IDealTracker[];
  guaranteeAmount?: number;
  guaranteeNote?: string;
  withholdingTax?: number;
  withholdingNote?: string;
  endDate?: Date;
  equities?: IEquity[];
  exclusivityNote?: string;
  expanses?: IExpanse[];
  fringes?: IFringes[];
  generalQualifiers?: string[];
  genreQualifiers?: string[];
  invoiceInfo?: IInvoiceInfo;
  isOptionalPics?: boolean;
  insideTerms?: ITerm[];
  isDeleted?: boolean;
  keyDates?: IKeyDate[];
  livingExpenses?: number;
  liqDamages?: ILiqDamage[];
  loanout?: ILoanout;
  localCurrency?: string;
  merchRates?: IMerchRate[];
  note?: string;
  nonCommissionableAreas?: INonCommissionableArea[];
  office?: string;
  options?: IOption[];
  opportunity?: IOpportunity;
  offerExpire?: Date;
  offerExpiryTimeZone?: string;
  promotorContacts?: IContact[];
  picOptions?: number;
  picNote?: string;
  project?: IProject;
  paymentNote?: string;
  proxyBuyer?: IProxyBuyer;
  renewalTerms?: IRenewalTerm[];
  recoupabilitys?: IRecoupability[];
  reimbExpanses?: IReimbExpanse[];
  royalties?: IRoyalty[];
  salaries?: ISalaries[];
  status?: string;
  seriesEpFee?: number;
  seriesEpNote?: string;
  submissionId?: string;
  startDate?: Date;
  termStartDate?: Date;
  termEndDate?: Date;
  termDuration?: number;
  wmeFees?: IWmeFee[];
  wmeBookingSlipId?: number;
  wmeBookingHubId?: string;
  wmeBookingId?: number;
  notes?: INote[];
}

/*
Calendars
*/

export interface IAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  addressType?: string;
  isPreferred?: boolean;
  isPrivate?: boolean;
  note?: string;
  expiredAt?: Date;
  longitude?: string;
  latitude?: string;
}

export interface ICalendar {
  clientId?: Uuid;
  eventDate?: Date;
  status?: string;
  notes?: INotes[];
  note?: string;
  address?: IAddress;
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

/*
Itineraries
*/
export interface IAddressFields {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  addressType: string;
  isPreferred?: boolean;
  isPrivate?: boolean;
  note?: string;
  expiredAt?: Date;
  longitude?: string;
  latitude?: string;
}

export interface IVenue {
  venueId: Uuid;
  companyName?: string;
  address: IAddressFields;
}

export interface IRefNameSchema {
  fullName: string;
}

export interface IExternalContact {
  contactId: Uuid;
  preferredName: IRefNameSchema;
  companyName?: string;
  jobTitle?: string;
  profileImagePath?: string;
}

export interface IShowSchedule {
  time?: string;
  timeTBD?: boolean;
  performer?: string;
  event?: string;
  duration?: number;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ITicketInfoField {
  announceDate?: Date;
  preSaleDate?: Date;
  onSaleDate?: Date;
  minAge?: number;
  isTixCount?: boolean;
  isSpecialCount?: boolean;
  ticketCount?: string;
  ticketUpdatedBy?: Uuid;
}

export interface ITax {
  type?: string;
  cap?: number;
  amount?: number;
  share?: number;
  calculatedBy?: string;
  totalAmount?: number;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface IDealNote {
  type?: string;
  note?: string;
  isBuyerAgreed?: boolean;
}

export interface IDealTracking {
  status?: string;
  date?: Date;
  note?: string;
}

export interface IPaymentHandling {
  entity?: string;
  note?: string;
}

export interface ITicket {
  type?: string;
  capacity?: number;
  comps?: number;
  kills?: number;
  sellable?: number;
  price?: number;
  grossPot?: number;
  sellableGrossPot?: number;
  facilityFee?: number;
  parkingFee?: number;
  charity?: number;
  ticketFee?: number;
  vip?: number;
  restoration?: number;
  other?: number;
  TotalPrice?: number;
  createdBy?: string;
  updatedBy?: string;
}

export interface IItinerary {
  bookingId: Uuid;
  eventDate: Date;
  venue?: IVenue;
  prodContact?: IExternalContact;
  showSchedules?: IShowSchedule[];
  tickets?: ITicket[];
  isDeleted?: boolean;
  scalingNote?: string;
  taxes?: ITax[];
  dealNotes?: IDealNote[];
  dealAdditionalNote?: string;
  dealTrackings?: IDealTracking[];
  paymentHandling?: IPaymentHandling[];
  isBaReceivedWmeWire?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

/*
Materials
*/
export interface IMaterial {
  bookingId?: Uuid;
  name?: string;
  path?: string;
  etag?: string;
  title?: string;
  size?: string;
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
  isConfirming?: boolean;
  isDeleted?: boolean;
}

/*
Payments
*/
export interface INote {
  note?: string;
  typeString?: string;
  noteText?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface IPayment {
  bookingId?: string; // Accepting string for now because HUB accepts Guid and BKS accepts integer
  bookingNumber?: string;
  wmeBookingSlipId?: number;
  wmeBookingHubId?: string;
  clientId?: string;
  item?: string;
  activityNo?: string;
  totalAmount?: number;
  paidAmount?: number;
  dueDate?: Date;
  dueAmount?: number;
  invoiceDate?: Date;
  currency?: string;
  note?: string;
  notes?: INote[];
  eTMSStatus?: string;
  serviceDate?: Date;
  amount?: number;
  description?: string;
  activityType?: string;
  serviceType?: string;
  isTBA?: boolean;
  isDeleted?: boolean;
  isClosed?: boolean;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}
