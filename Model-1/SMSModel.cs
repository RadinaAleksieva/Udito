using MongoDB.Bson.Serialization.Attributes;
using static DesignedByPo.SMSService.Database.Enums;

namespace DesignedByPo.SMSService.Database.Model;

public class SMSModel
{
    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;

    public string SenderCode { get; set; } = string.Empty;

    [BsonRequired]
    public string Message { get; set; } = string.Empty;

    [BsonRequired]
    public string OrderReference { get; set; } = string.Empty;

    public string ShippingLabel { get; set; } = string.Empty;

    public EnumMessageType Status { get; set; }

    public DateTime? SentOn { get; set; }
}
