"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.coreBuybackController = exports.invoiceController = exports.paymentController = exports.salesOrderController = void 0;
var service_1 = require("./service");
var logger_1 = require("../../logger");
exports.salesOrderController = {
    getOrders: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, status, customerId, limit, offset, orders, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = req.query, status = _a.status, customerId = _a.customerId, limit = _a.limit, offset = _a.offset;
                        return [4 /*yield*/, service_1.salesOrderService.getOrders({
                                status: status,
                                customerId: customerId,
                                limit: limit ? parseInt(limit) : undefined,
                                offset: offset ? parseInt(offset) : undefined
                            })];
                    case 1:
                        orders = _b.sent();
                        res.json({ data: orders });
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _b.sent();
                        logger_1.logger.error(error_1, 'Error fetching sales orders');
                        res.status(error_1.statusCode || 500).json({ error: error_1.message || 'Failed to fetch orders' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getOrderById: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, order, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.getOrderById(id)];
                    case 1:
                        order = _a.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        logger_1.logger.error(error_2, 'Error fetching sales order');
                        res.status(error_2.statusCode || 500).json({ error: error_2.message || 'Failed to fetch order' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    createOrder: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var order, error_3;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, service_1.salesOrderService.createOrder(req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        order = _b.sent();
                        res.status(201).json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_3 = _b.sent();
                        logger_1.logger.error(error_3, 'Error creating sales order');
                        res.status(error_3.statusCode || 500).json({ error: error_3.message || 'Failed to create order' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    updateOrder: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, order, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.updateOrder(id, req.body)];
                    case 1:
                        order = _a.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_4 = _a.sent();
                        logger_1.logger.error(error_4, 'Error updating sales order');
                        res.status(error_4.statusCode || 500).json({ error: error_4.message || 'Failed to update order' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    approveOrder: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, order, error_5;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.approveOrder(id, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        order = _b.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_5 = _b.sent();
                        logger_1.logger.error(error_5, 'Error approving sales order');
                        res.status(error_5.statusCode || 500).json({ error: error_5.message || 'Failed to approve order' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    startProduction: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, result, error_6;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.startProduction(id, req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        result = _b.sent();
                        res.json({ data: result });
                        return [3 /*break*/, 3];
                    case 2:
                        error_6 = _b.sent();
                        logger_1.logger.error(error_6, 'Error starting production');
                        res.status(error_6.statusCode || 500).json({ error: error_6.message || 'Failed to start production' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    cancelOrder: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, order, error_7;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.cancelOrder(id, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        order = _b.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_7 = _b.sent();
                        logger_1.logger.error(error_7, 'Error cancelling sales order');
                        res.status(error_7.statusCode || 500).json({ error: error_7.message || 'Failed to cancel order' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    markReady: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, order, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.salesOrderService.markReadyForPickup(id)];
                    case 1:
                        order = _a.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_8 = _a.sent();
                        logger_1.logger.error(error_8, 'Error marking order ready');
                        res.status(error_8.statusCode || 500).json({ error: error_8.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    recordPickup: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, _a, quantityPickedUp, packingBags, order, error_9;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        _a = req.body, quantityPickedUp = _a.quantityPickedUp, packingBags = _a.packingBags;
                        return [4 /*yield*/, service_1.salesOrderService.recordPickup(id, (_b = req.user) === null || _b === void 0 ? void 0 : _b.id, quantityPickedUp, packingBags)];
                    case 1:
                        order = _c.sent();
                        res.json({ data: order });
                        return [3 /*break*/, 3];
                    case 2:
                        error_9 = _c.sent();
                        logger_1.logger.error(error_9, 'Error recording pickup');
                        res.status(error_9.statusCode || 500).json({ error: error_9.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getCustomerBalance: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var customerId, balance, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        customerId = req.params.customerId;
                        return [4 /*yield*/, service_1.salesOrderService.getCustomerBalance(customerId)];
                    case 1:
                        balance = _a.sent();
                        res.json({ data: balance });
                        return [3 /*break*/, 3];
                    case 2:
                        error_10 = _a.sent();
                        logger_1.logger.error(error_10, 'Error fetching customer balance');
                        res.status(error_10.statusCode || 500).json({ error: error_10.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getCustomerAging: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var customerId, aging, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        customerId = req.params.customerId;
                        return [4 /*yield*/, service_1.salesOrderService.getCustomerAging(customerId)];
                    case 1:
                        aging = _a.sent();
                        res.json({ data: aging });
                        return [3 /*break*/, 3];
                    case 2:
                        error_11 = _a.sent();
                        logger_1.logger.error(error_11, 'Error fetching customer aging');
                        res.status(error_11.statusCode || 500).json({ error: error_11.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getAllCustomerBalances: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var balances, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, service_1.salesOrderService.getAllCustomerBalances()];
                    case 1:
                        balances = _a.sent();
                        res.json({ data: balances });
                        return [3 /*break*/, 3];
                    case 2:
                        error_12 = _a.sent();
                        logger_1.logger.error(error_12, 'Error fetching customer balances');
                        res.status(error_12.statusCode || 500).json({ error: error_12.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
};
exports.paymentController = {
    recordPayment: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var payment, error_13;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, service_1.paymentService.recordPayment(req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        payment = _b.sent();
                        res.status(201).json({ data: payment });
                        return [3 /*break*/, 3];
                    case 2:
                        error_13 = _b.sent();
                        logger_1.logger.error(error_13, 'Error recording payment');
                        res.status(error_13.statusCode || 500).json({ error: error_13.message || 'Failed to record payment' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getPayments: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, salesOrderId, customerId, dateFrom, dateTo, payments, error_14;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = req.query, salesOrderId = _a.salesOrderId, customerId = _a.customerId, dateFrom = _a.dateFrom, dateTo = _a.dateTo;
                        return [4 /*yield*/, service_1.paymentService.getPayments({
                                salesOrderId: salesOrderId,
                                customerId: customerId,
                                dateFrom: dateFrom,
                                dateTo: dateTo
                            })];
                    case 1:
                        payments = _b.sent();
                        res.json({ data: payments });
                        return [3 /*break*/, 3];
                    case 2:
                        error_14 = _b.sent();
                        logger_1.logger.error(error_14, 'Error fetching payments');
                        res.status(error_14.statusCode || 500).json({ error: error_14.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getPaymentsBySalesOrder: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var salesOrderId, payments, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        salesOrderId = req.params.salesOrderId;
                        return [4 /*yield*/, service_1.paymentService.getPaymentsBySalesOrder(salesOrderId)];
                    case 1:
                        payments = _a.sent();
                        res.json({ data: payments });
                        return [3 /*break*/, 3];
                    case 2:
                        error_15 = _a.sent();
                        logger_1.logger.error(error_15, 'Error fetching payments');
                        res.status(error_15.statusCode || 500).json({ error: error_15.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getPaymentsByCustomer: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var customerId, payments, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        customerId = req.params.customerId;
                        return [4 /*yield*/, service_1.paymentService.getPaymentsByCustomer(customerId)];
                    case 1:
                        payments = _a.sent();
                        res.json({ data: payments });
                        return [3 /*break*/, 3];
                    case 2:
                        error_16 = _a.sent();
                        logger_1.logger.error(error_16, 'Error fetching payments');
                        res.status(error_16.statusCode || 500).json({ error: error_16.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
};
exports.invoiceController = {
    createInvoice: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var invoice, error_17;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, service_1.invoiceService.createInvoice(req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        invoice = _b.sent();
                        res.status(201).json({ data: invoice });
                        return [3 /*break*/, 3];
                    case 2:
                        error_17 = _b.sent();
                        logger_1.logger.error(error_17, 'Error creating invoice');
                        res.status(error_17.statusCode || 500).json({ error: error_17.message || 'Failed to create invoice' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    issueInvoice: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, invoice, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.invoiceService.issueInvoice(id)];
                    case 1:
                        invoice = _a.sent();
                        res.json({ data: invoice });
                        return [3 /*break*/, 3];
                    case 2:
                        error_18 = _a.sent();
                        logger_1.logger.error(error_18, 'Error issuing invoice');
                        res.status(error_18.statusCode || 500).json({ error: error_18.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getInvoice: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var id, invoice, error_19;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = req.params.id;
                        return [4 /*yield*/, service_1.invoiceService.getInvoice(id)];
                    case 1:
                        invoice = _a.sent();
                        res.json({ data: invoice });
                        return [3 /*break*/, 3];
                    case 2:
                        error_19 = _a.sent();
                        logger_1.logger.error(error_19, 'Error fetching invoice');
                        res.status(error_19.statusCode || 500).json({ error: error_19.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getInvoices: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, status, customerId, invoices, error_20;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = req.query, status = _a.status, customerId = _a.customerId;
                        return [4 /*yield*/, service_1.invoiceService.getInvoices({
                                status: status,
                                customerId: customerId
                            })];
                    case 1:
                        invoices = _b.sent();
                        res.json({ data: invoices });
                        return [3 /*break*/, 3];
                    case 2:
                        error_20 = _b.sent();
                        logger_1.logger.error(error_20, 'Error fetching invoices');
                        res.status(error_20.statusCode || 500).json({ error: error_20.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
};
exports.coreBuybackController = {
    recordCoreBuyback: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var buyback, error_21;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, service_1.coreBuybackService.recordCoreBuyback(req.body, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)];
                    case 1:
                        buyback = _b.sent();
                        res.status(201).json({ data: buyback });
                        return [3 /*break*/, 3];
                    case 2:
                        error_21 = _b.sent();
                        logger_1.logger.error(error_21, 'Error recording core buyback');
                        res.status(error_21.statusCode || 500).json({ error: error_21.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getCoreBuybacks: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, customerId, dateFrom, dateTo, buybacks, error_22;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = req.query, customerId = _a.customerId, dateFrom = _a.dateFrom, dateTo = _a.dateTo;
                        return [4 /*yield*/, service_1.coreBuybackService.getCoreBuybacks({
                                customerId: customerId,
                                dateFrom: dateFrom,
                                dateTo: dateTo
                            })];
                    case 1:
                        buybacks = _b.sent();
                        res.json({ data: buybacks });
                        return [3 /*break*/, 3];
                    case 2:
                        error_22 = _b.sent();
                        logger_1.logger.error(error_22, 'Error fetching core buybacks');
                        res.status(error_22.statusCode || 500).json({ error: error_22.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getCustomerCoreBalance: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var customerId, balance, error_23;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        customerId = req.params.customerId;
                        return [4 /*yield*/, service_1.coreBuybackService.getCustomerCoreBalance(customerId)];
                    case 1:
                        balance = _a.sent();
                        res.json({ data: balance });
                        return [3 /*break*/, 3];
                    case 2:
                        error_23 = _a.sent();
                        logger_1.logger.error(error_23, 'Error fetching core balance');
                        res.status(error_23.statusCode || 500).json({ error: error_23.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    sellPackingBags: function (req, res) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, customerId, quantity, unitPrice, paymentMethod, referenceNumber, notes, userId, result, error_24;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        _a = req.body, customerId = _a.customerId, quantity = _a.quantity, unitPrice = _a.unitPrice, paymentMethod = _a.paymentMethod, referenceNumber = _a.referenceNumber, notes = _a.notes;
                        userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
                        return [4 /*yield*/, service_1.salesOrderService.sellPackingBags({
                                customerId: customerId,
                                quantity: quantity,
                                unitPrice: unitPrice,
                                paymentMethod: paymentMethod,
                                referenceNumber: referenceNumber,
                                notes: notes,
                                userId: userId
                            })];
                    case 1:
                        result = _c.sent();
                        res.status(201).json({ data: result });
                        return [3 /*break*/, 3];
                    case 2:
                        error_24 = _c.sent();
                        logger_1.logger.error(error_24, 'Error selling packing bags');
                        res.status(error_24.statusCode || 500).json({ error: error_24.message || 'Failed' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
};
