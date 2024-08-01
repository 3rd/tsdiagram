export interface IName {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
}

export interface IAddress {
  _id: RandomUuid;
  wmeAddressId: number;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  addressType: string;
  isPreferred: boolean;
  isPrivate: boolean;
  note: string;
  expiredAt: Date;
  longitude: string;
  latitude: string;
  createdBy: string;
  updatedBy: string;
}

export interface ISocialMedia {
  _id: RandomUuid;
  socialMediaType: string;
  url: string;
  createdBy: string;
  updatedBy: string;
}

export interface IHistoricalName {
  _id: RandomUuid;
  name: string;
  createdBy: string;
  updatedBy: string;
}

export interface IContact {
  _id: string;
  contactId: Uuid;
  preferredName: IName;
  companyName: string;
  jobTitle: string;
  createdBy: string;
  updatedBy: string;
  profileImagePath: string;
}

export interface IAgent {
  _id: string;
  agentId: RandomUuid;
  preferredName: IName;
  securityGroups: string[];
  initials: string;
  userType: string;
  isPoint: boolean;
  department: string;
  departmentGroup: string;
  profileImagePath: string;
  createdBy: string;
  updatedBy: string;
}

export interface IVenue {
  wmeVenueId: Uuid;
  profileImagePath: string;
  historicalNames: IHistoricalName[];
  addresses: IAddress[];
  information: string;
  ownerShip: string;
  buyerForVenue: string;
  currency: string;
  seatingLayouts: string[];
  isAlcoholServed: boolean;
  features: string[];
  isDeleted: boolean;
  socialMedias: ISocialMedia[];
  externalContacts: IContact[];
  companyName: string;
  sensitiveTerritory: boolean;
  venueType: string;
  capacity: string;
  agentContacts: IAgent[];
}

export interface IPhone {
  _id: RandomUuid;
  wmePhoneId: string;
  phoneNumber: string;
  countryCode: string;
  extension?: string;
  country?: string;
  phoneType?: string;
  note?: string;
  expiredAt?: Date;
  isAccounting: boolean;
  isAccountingTms: boolean;
  isPrivate: boolean;
  isPreferred: boolean;
  isDeleted: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export interface IEmail {
  _id: RandomUuid;
  wmeEmailId: string;
  emailAddress: string;
  emailType?: string;
  note?: string;
  expiredAt?: Date;
  isAccounting: boolean;
  isAccountingTms: boolean;
  isPrivate: boolean;
  isPreferred: boolean;
  isDeleted: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export interface IAddress {
  _id: RandomUuid;
  wmeAddressId: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  addressType?: string;
  note?: string;
  expiredAt?: Date; // for migration only
  isAccounting: boolean;
  isAccountingTms: boolean;
  isPrivate: boolean;
  isPreferred: boolean;
  isDeleted: boolean;
  createdBy?: string;
  updatedBy?: string;
}
