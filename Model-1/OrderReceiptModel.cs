using MongoDB.Bson.Serialization.Attributes;

namespace DesignedByPo.SMSService.Database.Model;

public class OrderReceiptModel : DocumentModel
{
    [BsonRequired]
    public string ExternalOrderIdentifier { get; set; } = string.Empty;

    public string? NoteHTML { get; set; }
}
