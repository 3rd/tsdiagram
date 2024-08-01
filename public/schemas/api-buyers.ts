export interface IDepartmentRefFields {
  departmentGroup?: string;
  department?: string;
}

export interface IMarketType {
  marketType?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface INote {
  note?: string;
  typeString?: string;
  noteText?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface IAddress {
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  addressType?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  isPreferred?: boolean;
  isAccounting?: boolean;
  isPrivateToTeam?: boolean;
  note?: string;
  expiredAt?: Date;
  createdBy?: string;
  UpdatedBy?: string;
  wmeAddressId?: Uuid;
}

export interface IDepartment {
  departmentGroup?: string;
  department?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface IName {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName: string;
}

export interface IAgentContact extends IDepartmentRefFields {
  agentId: Uuid;
  preferredName: IName;
  userType?: string;
  isCovering?: boolean;
  initials?: string;
  securityGroups?: string[];
  profileImagePath?: string;
  emailAddress?: string;
  phone?: {
    countryCode?: string;
    phoneNumber?: string;
  };
  isPoint?: boolean;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface IExternalContact {
  contactId: Uuid;
  preferredName: IName;
  companyName?: string;
  jobTitle?: string;
  profileImagePath?: string;
  emailAddress?: string;
  phone?: {
    countryCode?: string;
    phoneNumber?: string;
  };
  createdBy?: string;
  UpdatedBy?: string;
  isActive?: boolean;
}

export interface ICompany {
  buyerId?: Uuid;
  companyName?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface ILeadership {
  fullName?: string;
  jobTitle?: string;
  createdBy?: string;
  UpdatedBy?: string;
}

export interface IPhone {
  country?: string;
  countryCode?: string;
  phoneType: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  isPreferred?: boolean;
  isAccounting?: boolean;
  isPrivateToTeam?: boolean;
  phoneNumber?: string;
  extension?: string;
  note?: string;
  expiredAt?: Date;
  createdBy?: string;
  UpdatedBy?: string;
  wmePhoneId?: Uuid;
}

export interface IEmail {
  emailType: string;
  note?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  isPreferred?: boolean;
  isAccounting?: boolean;
  isPrivateToTeam?: boolean;
  expiredAt?: Date;
  emailAddress?: string;
  createdBy?: string;
  UpdatedBy?: string;
  wmeEmailId?: Uuid;
}

export interface ISocialMedia {
  socialMediaType?: string;
  url?: string;
}

export interface IBuyer {
  companyName?: string;
  addresses?: IAddress[];
  information?: string;
  note?: string;
  leaderships?: ILeadership[];
  parentCompany?: ICompany;
  departments?: IDepartment[];
  marketTypes?: IMarketType[];
  profileImagePath?: string;
  relatedBuyers?: ICompany[];
  website?: string;
  regions?: string[];
  socialMedias?: ISocialMedia[];
  emails?: IEmail[];
  phones?: IPhone[];
  isCover?: boolean;
  agentContacts?: IAgentContact[];
  externalContacts?: IExternalContact[];
  notes?: INote[];
  createdBy?: string;
  updatedBy?: string;
  isDeleted?: boolean;
  wmeBuyerId?: Uuid;
  sensitiveComment?: string;
  legalName?: IName;
  preferredName?: IName;
  loginEmail?: string;
  isIndividual?: boolean;
  isPenalty?: boolean;
  isActive?: boolean;
  winnerRecordId?: string;
}

/*
Bank Account Info
*/

export interface IBankAccount {
  wmeBankAccountId?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftCode?: string;
  accountNote?: string;
  paymentNote?: string;
  iban?: string;
  paymentType?: string;
  controlKey?: string;
  paymentTypeAssoc?: string[];
  address?: IAddress;
  isDeleted?: boolean;
  isVerified?: boolean;
  isBankSap?: boolean;

  // Intermediary bank details
  intermediaryBankSelected?: boolean;
  intermediaryBankName?: string;
  intermediaryBankRoutingNumber?: string;
  intermediaryBankAccountNumber?: string;
  intermediaryBankSwiftCode?: string;
  intermediaryBankIban?: string;

  intermediaryBankAddress?: IAddress;
  isIntermediaryBankSap?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

/*
Account schema
*/
export interface ISecondaryTaxId {
  wmeTaxId?: string;
  taxIdType?: string;
  tin?: string;
  country?: string;
  note?: string;
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export interface ICreateSecondaryTaxId extends ISecondaryTaxId {
  taxIdType: string;
  tin: string;
  country: string;
}

export interface IBuyerAccountingAdmin {
  accountingPeriods?: string[];
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export interface IVatDetail {
  vatNumber?: string;
  vatCountry?: string;
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export interface ICreateVatDetail extends IVatDetail {
  vatNumber: string;
  vatCountry: string;
}

export interface IAccount {
  entityType?: string;
  country?: string;
  taxIdType?: string;
  tin?: string;
  abnGst?: string;
  payableCurrencies?: string[];
  commissionMethod?: string;
  preferredMethod?: string;
  deliveryMethod?: string;
  note?: string;
  paymentNote?: string;
  statementPeriod?: string;
  outlet?: string;
  vatDetails?: IVatDetail[];
  bankAccounts?: IBankAccount[];
  secondaryTaxIds?: ISecondaryTaxId[];
  otherGuildMemberships?: string[];
  accountingAdmins?: IBuyerAccountingAdmin[];
  isDeleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

/*
Material Schema
*/
export interface IMaterial {
  materialId?: Uuid;
  buyerId?: Uuid;
  name: string;
  path: string;
  etag: string;
  title?: string;
  size?: string;
  expirationDate?: Date;
  revisionDate?: Date;
  revisionYear?: number;
  note?: string;
  isSecure?: boolean;
  createdBy?: string;
  updatedBy?: string;
  isDeleted?: boolean;
}
