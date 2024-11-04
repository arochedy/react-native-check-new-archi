export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface LibraryData {
  libraries?: Array<{
    expoGo?: boolean;
    newArchitecture?: boolean;
    github?: {
      newArchitecture?: boolean;
    };
  }>;
}

export interface CheckResult {
  total: number;
  supported: number;
  notSupported: number;
  notFound: number;
}

export interface Counts {
  supported: number;
  notSupported: number;
  notFound: number;
}

export interface PackageNameList {
  supportedList: Array<string>;
  notSupportedList: Array<string>;
  notFoundList: Array<string>;
}

export interface NpmRegistryResponse {
  repository?: {
    url?: string;
  };
}
