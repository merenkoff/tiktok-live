// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import axios from 'axios';
import { logger } from './logger.js';

const NOVAPOSHTA_API_URL = 'https://api.novaposhta.ua/v2.0/json/';

interface NovaPoshtaRequest {
  apiKey: string;
  modelName: string;
  calledMethod: string;
  methodProperties: Record<string, any>;
  language?: string;
}

interface NovaPoshtaResponse {
  success: boolean;
  data: any[];
  warnings?: string[];
  errors?: string[];
}

class NovaPoshtaClient {
  private apiKey: string;
  private merchantName: string;

  constructor() {
    this.apiKey = process.env.NOVAPOSHTA_API_KEY || '';
    this.merchantName = process.env.NOVAPOSHTA_MERCHANT_NAME || '';

    if (!this.apiKey) {
      logger.warn('Nova Poshta API key not configured');
    }
  }

  /**
   * Make request to Nova Poshta API
   */
  private async request(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, any>
  ): Promise<any> {
    const payload: NovaPoshtaRequest = {
      apiKey: this.apiKey,
      modelName,
      calledMethod,
      methodProperties,
      language: 'uk',
    };

    try {
      const response = await axios.post<NovaPoshtaResponse>(
        NOVAPOSHTA_API_URL,
        payload
      );

      if (!response.data.success) {
        logger.error('Nova Poshta API error', {
          errors: response.data.errors,
          warnings: response.data.warnings,
        });
        throw new Error(`Nova Poshta error: ${response.data.errors?.join(', ')}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('Nova Poshta request failed', { error, modelName, calledMethod });
      throw error;
    }
  }

  /**
   * Get available cities for delivery
   */
  async getCities(): Promise<Array<{ Ref: string; Description: string }>> {
    try {
      const result = await this.request('Address', 'getCities', {
        Page: '1',
        Limit: '500',
      });

      return result.map((city: any) => ({
        Ref: city.Ref,
        Description: city.Description,
      }));
    } catch (error) {
      logger.error('Failed to get cities', { error });
      return [];
    }
  }

  /**
   * Get branches in a city
   */
  async getBranches(cityRef: string): Promise<Array<{ Ref: string; Description: string }>> {
    try {
      const result = await this.request('Address', 'getWarehouses', {
        CityRef: cityRef,
        Page: '1',
        Limit: '500',
      });

      return result.map((branch: any) => ({
        Ref: branch.Ref,
        Description: branch.Description,
      }));
    } catch (error) {
      logger.error('Failed to get branches', { error, cityRef });
      return [];
    }
  }

  /**
   * Create InternetDocument (shipment)
   * This creates a waybill/tracking number
   */
  async createInternetDocument(options: {
    senderAddress: string;
    recipientAddress: string;
    recipientName: string;
    recipientPhone: string;
    weight: number; // in grams
    cost?: number; // optional, for declaration
    description: string;
  }): Promise<{ Ref: string; Number: string }> {
    try {
      const result = await this.request('InternetDocument', 'save', {
        Sender: this.merchantName,
        SenderAddress: options.senderAddress, // Warehouse Ref
        Recipient: options.recipientName,
        RecipientType: 'PrivatePerson',
        RecipientAddress: options.recipientAddress, // Warehouse Ref
        RecipientPhone: options.recipientPhone,
        PaymentMethod: 'Cash', // Client pays on delivery
        CargoType: 'Parcel',
        Weight: options.weight,
        ServiceType: 'WarehouseWarehouse', // Pickup from warehouse to branch
        Cost: options.cost || 100, // Default cost
        Description: options.description,
        OptionsSMS: 1, // Send SMS to recipient
      });

      if (!result || result.length === 0) {
        throw new Error('No document reference returned');
      }

      const doc = result[0];
      logger.info('Internet document created', {
        Ref: doc.Ref,
        Number: doc.Number,
      });

      return {
        Ref: doc.Ref,
        Number: doc.Number, // This is the tracking number (TTN)
      };
    } catch (error) {
      logger.error('Failed to create internet document', { error, options });
      throw error;
    }
  }

  /**
   * Get tracking status
   */
  async getTrackingStatus(
    documentNumber: string
  ): Promise<{
    Number: string;
    Status: string;
    StatusCode: string;
    WarehouseRecipient: string;
  } | null> {
    try {
      const result = await this.request('TrackingDocument', 'getStatusDocuments', {
        Documents: [
          {
            DocumentNumber: documentNumber,
            Phone: '', // Optional
          },
        ],
      });

      if (!result || result.length === 0) {
        logger.warn('No tracking info found', { documentNumber });
        return null;
      }

      const doc = result[0];
      return {
        Number: doc.Number,
        Status: doc.Status,
        StatusCode: doc.StatusCode,
        WarehouseRecipient: doc.WarehouseRecipient,
      };
    } catch (error) {
      logger.error('Failed to get tracking status', { error, documentNumber });
      return null;
    }
  }

  /**
   * Get printable document
   */
  async getPrintForm(documentRef: string): Promise<string | null> {
    try {
      const result = await this.request('InternetDocument', 'printDocument', {
        DocumentRefs: [documentRef],
        Type: 'pdf',
      });

      if (!result || !result[0]) {
        logger.warn('No print form generated', { documentRef });
        return null;
      }

      return result[0].printDocumentLinkPrintDocument;
    } catch (error) {
      logger.error('Failed to get print form', { error, documentRef });
      return null;
    }
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.merchantName;
  }
}

// Singleton
let novaPoshtaClient: NovaPoshtaClient | null = null;

export function getNovaPoshtaClient(): NovaPoshtaClient {
  if (!novaPoshtaClient) {
    novaPoshtaClient = new NovaPoshtaClient();
  }
  return novaPoshtaClient;
}

export type { NovaPoshtaResponse };
