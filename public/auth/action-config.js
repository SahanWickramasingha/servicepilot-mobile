// Public application configuration, never credentials. Query parameters cannot
// override this project, these destinations, or the authentication endpoint.
export const actionConfig = {
  firebase: {
    apiKey: "AIzaSyAKPlFn0eosrpqD0v8FxAfk-NsgONd51i4",
    authDomain: "servicepilot-756d9.firebaseapp.com",
    projectId: "servicepilot-756d9",
    appId: "1:869400470316:web:3ccdf35ad3cbb368698289",
  },
  mobileSignIn: "servicepilotmobile://login",
  webSignIn: "/login",
  emulatorUrl: null,
};
