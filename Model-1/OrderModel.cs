using MongoDB.Bson.Serialization.Attributes;
using System.ComponentModel.DataAnnotations.Schema;
using System.Globalization;
using static DesignedByPo.SMSService.Common.Enums;

namespace DesignedByPo.SMSService.Database.Model;

public class OrderModel : DocumentModel
{
    [BsonRequired]
    public string OrderNumber { get; set; } = string.Empty;

    public string? VirtualFiscalNoteNumber { get; set; }

    public string? VirtualFiscalNoteKey { get; set; }

    [BsonRequired]
    public string ExternalId { get; set; } = string.Empty;

    [BsonRequired]
    public string Authority { get; set; } = string.Empty;

    [BsonRequired]
    public string RecipientName { get; set; } = string.Empty;

    public string[] RecipientContacts { get; set; } = Array.Empty<string>();

    public decimal? Amount { get; set; }

    public decimal? ShippingAmount { get; set; }

    public decimal? TotalTax { get; set; }

    public bool? IsDeleted { get; set; }

    public string? Notes { get; set; }

    public string? ShippingLabel { get; set; }

    public DateTime OrderDate { get; set; }
    [NotMapped]
    public string OrderDateTimeFormatted => OrderDate.ToString("yyyy-MMM-dd HH:mm", new CultureInfo("bg-BG"));

    public FulfillmentStatusEnum OrderStatus { get; set; } = FulfillmentStatusEnum.Unknown;

    public PaymentDetails? PaymentsData { get; set; }

    public List<OrderDetail> Details { get; set; } = [];
}

public class PaymentDetails
{
    public PaymentTypeEnum? PaymentProviderStatus { get; set; }

    public string? PaymentProviderTransactionId { get; set; }
    public string? PaymentProvider { get; set; }

    public string? CardProvider { get; set; }
    public string? CardAnonymisedNumber { get; set; }
    public DateTime PaymentProceededAt { get; set; }
}

public class OrderDetail
{
    [BsonRequired]
    public string ProductName { get; set; } = string.Empty;

    [BsonRequired]
    public decimal Quantity { get; set; }

    /// <summary>
    /// Single price of the product without VAT.
    /// </summary>
    [BsonRequired]
    public decimal PricePerUnit { get; set; }

    /// <summary>
    /// Total TAX amount for the row.
    /// </summary>
    [BsonRequired]
    public decimal TaxAmount { get; set; }

    /// <summary>
    /// TaxPercent for the row.
    /// </summary>
    [BsonRequired]
    public decimal TaxPercent { get; set; }

    /// <summary>
    /// Total discount amount for the row.
    /// </summary>
    [BsonRequired]
    public decimal Discount { get; set; }

    [BsonRequired]
    public string[]? ExternalProductIdentities { get; set; }
}
