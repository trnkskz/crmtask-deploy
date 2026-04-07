const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('PricingController', () => {
    it('refreshes admin pricing data without reinitializing the whole app shell', async () => {
        const elements = {
            draftKomisyonList: createElement(),
            draftHizmetlerList: createElement(),
            draftDopinglerList: createElement(),
            draftSosyalList: createElement(),
            draftCodeBundleList: createElement(),
            draftDiscountCouponList: createElement(),
        };
        const document = createDocument(elements);
        const fetchOnce = jest.fn().mockResolvedValue({
            COMMISSION: { items: [{ id: 'c1', name: 'Komisyon', val: '%10' }] },
            SERVICE: { items: [{ id: 's1', name: 'Gold Paket', priceEx: 1000, priceInc: 1200 }] },
            DOPING: { items: [] },
            SOCIAL_MEDIA: { items: [] },
            RULES: {
                codeBundles: [{ name: '50 Kod', priceInc: 1000 }],
                discountCoupons: [{ title: 'Cafe-Restoran', rules: ['500 TL ve üzeri -> 100 TL indirim'] }],
            },
        });
        const init = jest.fn();
        const appState = {
            pricingData: null,
            offerCart: [],
        };

        const { context } = loadController('controllers/pricingController.js', 'PricingController', {
            document,
            AppState: appState,
            DataService: { fetchOnce, apiRequest: jest.fn() },
            AppController: { init },
            DEFAULT_PRICING_DATA: {
                COMMISSION: { items: [] },
                SERVICE: { items: [] },
                DOPING: { items: [] },
                SOCIAL_MEDIA: { items: [] },
            },
            showToast: jest.fn(),
            askConfirm: jest.fn(),
        });

        await context.PricingController.renderAdminPricing();

        expect(fetchOnce).toHaveBeenCalledWith('pricingData');
        expect(init).not.toHaveBeenCalled();
        expect(elements.draftKomisyonList.innerHTML).toContain('Komisyon');
        expect(elements.draftHizmetlerList.innerHTML).toContain('KDV Dahil: 1.200₺');
        expect(elements.draftCodeBundleList.innerHTML).toContain('50 Kod');
        expect(elements.draftDiscountCouponList.innerHTML).toContain('Cafe-Restoran');
    });
});
