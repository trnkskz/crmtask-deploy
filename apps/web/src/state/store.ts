export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface StoreState {
  loggedInUser: SessionUser | null;
}

const state: StoreState = {
  loggedInUser: null,
};

export const store = {
  getState: (): StoreState => state,
  setLoggedInUser: (user: SessionUser | null): void => {
    state.loggedInUser = user;
  },
};
