using MongoDB.Bson.Serialization.Attributes;

namespace DesignedByPo.SMSService.Database.Model;

public class TemplateKeyWord
{
    [BsonRequired]
    public string Key { get; set; }

    [BsonRequired]
    public string ReferenceTo { get; set; }
}
