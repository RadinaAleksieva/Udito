using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Globalization;

namespace DesignedByPo.SMSService.Database.Model;

public class DocumentModel
{
    [BsonId]
    public ObjectId Id { get; set; } = ObjectId.GenerateNewId();

    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;
    public string CreatedOnFormatted => CreatedOn.ToString("yyyy-MMM-dd HH:mm", new CultureInfo("bg-BG"));
}
