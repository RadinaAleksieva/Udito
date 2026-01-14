using MongoDB.Bson.Serialization.Attributes;
using static DesignedByPo.SMSService.Database.Enums;

namespace DesignedByPo.SMSService.Database.Model;

public class MessagesSentHistoryModel : DocumentModel
{
    [BsonRequired]
    public string? MessageContent { get; set; }

    public EnumTamplateType Type { get; set; }

    [BsonRequired]
    public string? Destination { get; set; }
}
