export interface IName {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
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

export interface IClient {
  _id: string;
  clientId: Uuid;
  preferredName: {
    fullName: string;
  };
  profileImagePath: string;
}

export interface IBuyer {
  _id: string;
  buyerId: Uuid;
  buyerName: string;
  profileImagePath: string;
}

export interface INote {
  _id: RandomUuid;
  note: string;
  typeString: string;
  noteText: string;
  createdBy: string;
  UpdatedBy: string;
}

// Assuming addressSchema, emailSchema, and phoneSchema are defined elsewhere
// and have corresponding TypeScript interfaces.

export interface IContact {
  wmeContactId: number;
  preferredName: IName;
  legalName: IName;
  nickNames: string[];
  addresses: IAddress[];
  emails: IEmail[];
  phones: IPhone[];
  clients: IClient[];
  buyers: IBuyer[];
  companyName: string;
  jobTitle: string;
  note: string;
  createdBy: string;
  isDeleted: boolean;
}

export interface IContactSchema extends IContact {
  _id: RandomUuid;
  notes: INote[];
  isWmeDefault: boolean;
}
