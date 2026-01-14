using System;

namespace DesignedByPo.SMSService.Database.Model.Dtos;


public class NRAComplianceData
{
    public bool IsCompliant { get; set; }
    public int DocumentsThisMonth { get; set; }
    public DateTime? LastAuditFileDate { get; set; }
    public int PendingDocuments { get; set; }
    public List<string> ComplianceIssues { get; set; } = new();
}