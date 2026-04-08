import constantsUrl from './js/config/constants.js?url';
import storeUrl from './js/state/store.js?url';
import helpersUrl from './js/utils/helpers.js?url';
import contactParityUrl from './js/utils/contactParity.js?url';
import taskSavePayloadUrl from './js/utils/taskSavePayload.js?url';
import csvImportUrl from './js/utils/csvImport.js?url';
import systemPersistenceUrl from './js/utils/systemPersistence.js?url';
import uiUrl from './js/utils/ui.js?url';
import dataServiceUrl from './js/services/dataService.js?url';
import syncServiceUrl from './js/services/syncService.js?url';
import authControllerUrl from './js/controllers/authController.js?url';
import dropdownControllerUrl from './js/controllers/dropdownController.js?url';
import taskControllerUrl from './js/controllers/taskController.js?url';
import poolControllerUrl from './js/controllers/poolController.js?url';
import reportControllerUrl from './js/controllers/reportController.js?url';
import adminControllerUrl from './js/controllers/adminController.js?url';
import pricingControllerUrl from './js/controllers/pricingController.js?url';
import dashboardControllerUrl from './js/controllers/dashboardController.js?url';
import operationsRadarControllerUrl from './js/controllers/operationsRadarController.js?url';
import businessControllerUrl from './js/controllers/businessController.js?url';
import projectControllerUrl from './js/controllers/projectController.js?url';
import requestControllerUrl from './js/controllers/requestController.js?url';
import appControllerUrl from './js/controllers/appController.js?url';
import appUrl from './js/app.js?url';

const legacyScriptUrls = [
  constantsUrl,
  storeUrl,
  helpersUrl,
  contactParityUrl,
  taskSavePayloadUrl,
  csvImportUrl,
  systemPersistenceUrl,
  uiUrl,
  dataServiceUrl,
  syncServiceUrl,
  authControllerUrl,
  dropdownControllerUrl,
  taskControllerUrl,
  poolControllerUrl,
  reportControllerUrl,
  adminControllerUrl,
  pricingControllerUrl,
  dashboardControllerUrl,
  operationsRadarControllerUrl,
  businessControllerUrl,
  projectControllerUrl,
  requestControllerUrl,
  appControllerUrl,
  appUrl,
];

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve(src);
    script.onerror = () => reject(new Error(`Legacy script load failed: ${src}`));
    document.head.appendChild(script);
  });
}

async function bootstrapLegacyScripts() {
  for (const scriptUrl of legacyScriptUrls) {
    await loadClassicScript(scriptUrl);
  }
}

bootstrapLegacyScripts().catch((error) => {
  console.error('Legacy bootstrap failed:', error);
});
