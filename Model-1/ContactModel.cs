using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace DesignedByPo.SMSService.Database.Model;

public class ContactModel : DocumentModel
{
    [BsonRequired]
    public string Name { get; set; } = string.Empty;

    [BsonRequired]
    public string PhoneNumber { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Notes { get; set; }

    public bool IsDeleted { get; set; }

    public string? ExternalContactId { get; set; }

    public List<SMSModel> SMSModels { get; set; } = [];

    public List<OrderModelMinimal> OrderReferences { get; set; } = [];

    [BsonIgnore]
    public bool IsBadgeVisible => SMSModels.Any();

    [BsonIgnore]
    public int SMSsCount => SMSModels.Count();
}

public class OrderModelMinimal
{
    [BsonRequired]
    public string OrderNumber { get; set; } = string.Empty;
    [BsonRequired]
    public string ExternalId { get; set; } = string.Empty;
    [BsonRequired]
    public string Authority { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? ShippingLabel { get; set; }
    public DateTime OrderDate { get; set; }
}